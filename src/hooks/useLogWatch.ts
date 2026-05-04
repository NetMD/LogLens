// 실시간 로그 감시 훅 (분리)
// - useLogWatchController: Tauri event listen 4채널 구독 전용. MainLayout에서만 1회 호출.
// - useLogWatchActions: start/stop 액션 전용. 어느 컴포넌트에서나 호출 가능 (listen 등록 안 함).
//
// 두 훅은 멀티라인 스택트레이스 이월 처리를 위해 모듈 스코프의 pendingEntryRef 와
// rateLimiter / lastDroppedToastAt 상태를 공유한다.
// (zustand persist 대상이 아니며 전역 store에 들어갈 성격도 아니므로 모듈 스코프로 둠)

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  WATCH_EVENTS,
  type LineAddedPayload,
  type RotatedPayload,
  type StartWatchResponse,
  type StoppedPayload,
  type WatchErrorPayload,
} from "../shared/watchEvents";
import { useLogStore } from "../store/logStore";
import { useSettingsStore } from "../store/settingsStore";
import { useUiStore } from "../store/uiStore";
import { parseBatch, resetParser } from "../utils/logParser";
import type { LogEntry } from "../utils/logParser";
import { ToastRateLimiter } from "../utils/toastRateLimiter";

// log-watch-error 사용자 친화 메시지 매핑 (Security M-2)
const ERROR_LABELS: Record<string, string> = {
  FILE_NOT_FOUND: "파일을 찾을 수 없습니다",
  PERMISSION_DENIED: "파일 접근 권한이 없습니다",
  WATCHER_INIT_FAILED: "실시간 감시를 초기화할 수 없습니다",
  IO_ERROR: "파일 읽기 오류",
  INVALID_PATH: "잘못된 파일 경로",
};

// droppedCount 토스트 rate limit 최소 간격 (ms)
const DROPPED_TOAST_MIN_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────
// 모듈 스코프 공유 상태 (controller / actions 가 함께 참조)
// ─────────────────────────────────────────────────────────────────────

// 멀티라인 스택트레이스 이월용 pending 엔트리
const pendingEntryRef: { current: Partial<LogEntry> | null } = { current: null };

// ERROR/FATAL 토스트 rate limiter (세션 간 reset)
const rateLimiter = new ToastRateLimiter();

// droppedCount 토스트 마지막 표시 시각 (세션 간 reset)
const droppedToastState = { lastAt: 0 };

// ─────────────────────────────────────────────────────────────────────
// 1) 이벤트 구독 전용 훅 — MainLayout 에서만 1회 호출
// ─────────────────────────────────────────────────────────────────────

export function useLogWatchController(): void {
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const appendEntries = useLogStore((s) => s.appendEntries);
  const setWatchMode = useLogStore((s) => s.setWatchMode);
  const setWatchError = useLogStore((s) => s.setWatchError);

  // 공통: line-added 페이로드 처리
  const handleLineAdded = useCallback(
    (payload: LineAddedPayload) => {
      const sessionId = useLogStore.getState().watchSessionId;
      if (sessionId && payload.sessionId !== sessionId) {
        // 다른 세션 이벤트는 무시
        return;
      }

      const result = parseBatch(payload.lines, pendingEntryRef.current);
      pendingEntryRef.current = result.pending;

      if (result.entries.length > 0) {
        appendEntries(result.entries);

        // ERROR/FATAL 토스트 (rate limit + errorToast 설정 확인)
        // Security M-2: 원시 로그 메시지는 토스트에 노출하지 않음
        const { errorToast: errorToastEnabled } = useSettingsStore.getState();
        if (errorToastEnabled) {
          for (const entry of result.entries) {
            if (entry.level === "ERROR" || entry.level === "FATAL") {
              const key = entry.exceptionClass ?? entry.logger ?? "ERROR";
              if (rateLimiter.allow(key)) {
                toast.error(entry.exceptionClass ?? "ERROR", {
                  description: "메인 뷰에서 전체 로그를 확인하세요.",
                });
              }
            }
          }
        }

        // 자동 스크롤 일시정지 상태면 pending 카운트 증가
        const { autoScrollPaused, incrementPendingNewLineCount } =
          useUiStore.getState();
        if (autoScrollPaused) {
          incrementPendingNewLineCount(result.entries.length);
        }
      }

      if (payload.droppedCount > 0) {
        // 세션 내 최소 5초 간격 rate limit
        const now = Date.now();
        if (now - droppedToastState.lastAt >= DROPPED_TOAST_MIN_INTERVAL_MS) {
          droppedToastState.lastAt = now;
          toast.warning(
            `일부 로그가 유실되었습니다 (${payload.droppedCount}건)`
          );
        }
      }
    },
    [appendEntries]
  );

  useEffect(() => {
    let cancelled = false;

    const register = async () => {
      try {
        const u1 = await listen<LineAddedPayload>(
          WATCH_EVENTS.LINE_ADDED,
          (event) => {
            handleLineAdded(event.payload);
          }
        );
        const u2 = await listen<RotatedPayload>(
          WATCH_EVENTS.ROTATED,
          (event) => {
            const sessionId = useLogStore.getState().watchSessionId;
            if (sessionId && event.payload.sessionId !== sessionId) return;
            useUiStore.getState().showRotationBanner(event.payload.reason);
            pendingEntryRef.current = null;
          }
        );
        const u3 = await listen<WatchErrorPayload>(
          WATCH_EVENTS.ERROR,
          (event) => {
            const sessionId = useLogStore.getState().watchSessionId;
            if (sessionId && event.payload.sessionId !== sessionId) return;
            // Security M-2: 에러 코드 기반 사용자 친화 메시지 매핑
            const label =
              ERROR_LABELS[event.payload.error.code] ?? "실시간 감시 오류";
            setWatchError(label);
            toast.error(label);
            if (event.payload.fatal) {
              setWatchMode("error");
            }
          }
        );
        const u4 = await listen<StoppedPayload>(
          WATCH_EVENTS.STOPPED,
          (event) => {
            const sessionId = useLogStore.getState().watchSessionId;
            if (sessionId && event.payload.sessionId !== sessionId) return;
            setWatchMode("idle");
            // sessionId만 초기화, watchPath는 유지 (idle에서 재시작 가능)
            useLogStore.setState({ watchSessionId: null });
            pendingEntryRef.current = null;
          }
        );

        if (cancelled) {
          u1();
          u2();
          u3();
          u4();
          return;
        }
        unlistenersRef.current = [u1, u2, u3, u4];
      } catch (e) {
        // 브라우저(non-Tauri) 환경에서는 listen 이 실패할 수 있음 — 무시
        if (import.meta.env.DEV) {
          console.warn("[useLogWatchController] listen 등록 실패", e);
        }
      }
    };

    register();

    return () => {
      cancelled = true;
      unlistenersRef.current.forEach((u) => {
        try {
          u();
        } catch {
          // noop
        }
      });
      unlistenersRef.current = [];
    };
    // handleLineAdded 는 appendEntries 의존. store action 은 안정 참조
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─────────────────────────────────────────────────────────────────────
// 2) 액션 전용 훅 — 어느 컴포넌트든 호출 가능 (listen 없음)
// ─────────────────────────────────────────────────────────────────────

export interface UseLogWatchActions {
  start: (pathArg?: string) => Promise<void>;
  stop: () => Promise<void>;
}

export function useLogWatchActions(): UseLogWatchActions {
  const appendEntries = useLogStore((s) => s.appendEntries);
  const setWatchMode = useLogStore((s) => s.setWatchMode);
  const setWatchSession = useLogStore((s) => s.setWatchSession);
  const setWatchError = useLogStore((s) => s.setWatchError);
  const resetWatch = useLogStore((s) => s.resetWatch);
  const setFile = useLogStore((s) => s.setFile);

  // 파일 대화상자 열어 경로 획득
  const pickFile = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Log Files", extensions: ["log", "txt", "csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!selected || typeof selected !== "string") return null;
      return selected;
    } catch (e) {
      toast.error("파일 선택 실패", { description: String(e) });
      return null;
    }
  }, []);

  const start = useCallback(
    async (pathArg?: string): Promise<void> => {
      const path = pathArg ?? (await pickFile());
      if (!path) return;

      // 파일 메타데이터 선검사 — 500MB 초과, 존재 여부, 권한 등을 사전 차단
      try {
        await invoke("get_file_metadata", { path });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("파일을 열 수 없습니다", { description: msg });
        return;
      }

      setWatchMode("starting");
      setWatchError(null);

      try {
        const currentPath = useLogStore.getState().watchPath;
        const isSamePath = currentPath === path;

        const resp = await invoke<StartWatchResponse>("start_watch", { path });

        if (isSamePath) {
          // 동일 경로 재시작: 기존 entries 유지, 새 세션만 연결
          setWatchSession(resp.sessionId, path);
          setWatchMode("watching");
          useUiStore.getState().requestModeChange({
            appMode: "live",
            mainView: "liveLog",
          });
          return;
        }

        // 새 파일: 초기 라인 파싱 + entries 초기화
        resetParser();
        pendingEntryRef.current = null;
        const result = parseBatch(resp.initialLines ?? [], null);
        pendingEntryRef.current = result.pending;

        resetWatch();
        rateLimiter.reset();
        droppedToastState.lastAt = 0;

        const baseName = path.split(/[\\/]/).pop() ?? path;
        setFile(baseName, path, 0);

        if (result.entries.length > 0) {
          appendEntries(result.entries);
        }
        setWatchSession(resp.sessionId, path);
        setWatchMode("watching");
        useUiStore.getState().requestModeChange({
          appMode: "live",
          mainView: "liveLog",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setWatchError(msg);
        setWatchMode("idle");
        toast.error("감시 시작 실패", { description: msg });
      }
    },
    [
      appendEntries,
      pickFile,
      resetWatch,
      setFile,
      setWatchError,
      setWatchMode,
      setWatchSession,
    ]
  );

  const stop = useCallback(async (): Promise<void> => {
    try {
      await invoke("stop_watch");
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[useLogWatchActions] stop_watch 실패", e);
      }
    } finally {
      setWatchMode("idle");
      // sessionId만 초기화, watchPath는 유지 (idle에서 재시작 가능)
      useLogStore.setState({ watchSessionId: null });
      pendingEntryRef.current = null;
    }
  }, [setWatchMode]);

  return { start, stop };
}

// ─────────────────────────────────────────────────────────────────────
// 호환 re-export — 기존 import 경로 보존
// ─────────────────────────────────────────────────────────────────────

/**
 * @deprecated useLogWatchController + useLogWatchActions 로 분리됨.
 * 신규 코드에서는 사용하지 말 것 (중복 listen 위험).
 */
export const useLogWatch = useLogWatchController;
