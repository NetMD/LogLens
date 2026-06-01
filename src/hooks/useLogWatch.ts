// 실시간 로그 감시 훅 (분리) — R13 fileId 스코프
// - useLogWatchController: Tauri event listen 4채널 구독 전용. MainLayout에서만 1회 호출.
//   활성 live 탭 1개만 구독 (sessionId → fileId 역인덱싱).
// - useLogWatchActions: start/stop 액션 전용 (listen 없음).
//
// 모듈 스코프 pending/rateLimiter/droppedToast 는 fileId별 Map 으로 분리 (BL-13/H-3).

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
import i18n from "../i18n";
import { useLogStore } from "../store/logStore";
import { useSettingsStore } from "../store/settingsStore";
import { useUiStore } from "../store/uiStore";
import { parseBatch } from "../utils/logParser";
import type { LogEntry } from "../utils/logParser";
import { ToastRateLimiter } from "../utils/toastRateLimiter";

// log-watch-error 사용자 친화 메시지 i18n key 매핑 (Security M-2)
const ERROR_LABEL_KEYS: Record<string, string> = {
  FILE_NOT_FOUND: "realtime.errorFileNotFound",
  PERMISSION_DENIED: "realtime.errorPermissionDenied",
  WATCHER_INIT_FAILED: "realtime.errorWatcherInit",
  IO_ERROR: "realtime.errorIo",
  INVALID_PATH: "realtime.errorInvalidPath",
};

const DROPPED_TOAST_MIN_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────
// 모듈 스코프 공유 상태 — fileId별 Map 으로 분리 (BL-13/H-3)
// ─────────────────────────────────────────────────────────────────────
const pendingByFile = new Map<string, Partial<LogEntry> | null>();
const rateLimiterByFile = new Map<string, ToastRateLimiter>();
const droppedToastByFile = new Map<string, { lastAt: number }>();

// sessionId → fileId 역인덱스 (활성 watcher 1개 모델)
const sessionToFileId = new Map<string, string>();

function getRateLimiter(fileId: string): ToastRateLimiter {
  let rl = rateLimiterByFile.get(fileId);
  if (!rl) {
    rl = new ToastRateLimiter();
    rateLimiterByFile.set(fileId, rl);
  }
  return rl;
}

function getDroppedState(fileId: string): { lastAt: number } {
  let s = droppedToastByFile.get(fileId);
  if (!s) {
    s = { lastAt: 0 };
    droppedToastByFile.set(fileId, s);
  }
  return s;
}

// 현재 watching/starting 상태인 live 탭 fileId 찾기 (활성 watcher ≤ 1)
function findActiveWatchingFileId(): string | null {
  const { files, fileOrder } = useLogStore.getState();
  for (const id of fileOrder) {
    const f = files[id];
    if (
      f.kind === "live" &&
      (f.watchMode === "watching" || f.watchMode === "starting")
    ) {
      return id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 단일 위임 — watch start/stop (EXT-008)
// ─────────────────────────────────────────────────────────────────────

/** 탭 비활성화/닫기 시 활성 watcher teardown (offset 보관, AC-07-4 누락 0) */
export async function teardownActiveWatcher(): Promise<void> {
  const activeLive = findActiveWatchingFileId();
  if (!activeLive) return;
  try {
    const status = await invoke<{ offset: number } | null>("get_watch_status");
    if (status) {
      useLogStore.getState().setLastReadOffset(activeLive, status.offset);
    }
  } catch {
    /* status 조회 실패는 무시 (catch-up 정확도만 손실) */
  }
  try {
    await invoke("stop_watch"); // allow: watch 정리 단일 진입점
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[useLogWatch] stop_watch 실패", e);
    }
  }
  useLogStore.getState().setWatchMode(activeLive, "idle");
  const sid = useLogStore.getState().files[activeLive]?.watchSessionId;
  if (sid) sessionToFileId.delete(sid);
  useLogStore.getState().setWatchSession(activeLive, null, useLogStore.getState().files[activeLive]?.watchPath ?? null);
  pendingByFile.set(activeLive, null);
}

/** 탭 활성화 시 catch-up 재개 (GATE-R13-1: start_offset 사용) */
export async function activateLiveTab(fileId: string): Promise<void> {
  const f = useLogStore.getState().files[fileId];
  if (!f || f.kind !== "live" || !f.watchPath) return;
  await teardownActiveWatcher(); // 이전 활성 live watcher stop (offset 보관)

  useLogStore.getState().setWatchMode(fileId, "starting");
  useLogStore.getState().setWatchError(fileId, null);
  try {
    const resp = await invoke<StartWatchResponse>("start_watch", { // allow: watch 활성화 단일 진입점
      path: f.watchPath,
      startOffset: f.lastReadOffset ?? null, // null=신규 tail, Some(off)=catch-up
    });
    sessionToFileId.set(resp.sessionId, fileId);
    useLogStore.getState().setWatchSession(fileId, resp.sessionId, f.watchPath);
    useLogStore.getState().setWatchMode(fileId, "watching");

    // 초기 라인 파싱 (신규 watch 의 tail 또는 catch-up 결과)
    pendingByFile.set(fileId, null);
    const result = parseBatch(resp.initialLines ?? [], null, { fileIdSalt: fileId });
    pendingByFile.set(fileId, result.pending);
    if (result.entries.length > 0) {
      useLogStore.getState().appendEntries(fileId, result.entries);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useLogStore.getState().setWatchError(fileId, msg);
    useLogStore.getState().setWatchMode(fileId, "idle");
    toast.error(i18n.t("sidebar.watchStartFailed"), { description: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────
// 1) 이벤트 구독 전용 훅 — MainLayout 에서만 1회 호출
// ─────────────────────────────────────────────────────────────────────

export function useLogWatchController(): void {
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  // 공통: line-added 페이로드 처리 (sessionId → fileId 역인덱싱)
  const handleLineAdded = useCallback((payload: LineAddedPayload) => {
    const fileId = sessionToFileId.get(payload.sessionId);
    if (!fileId) return; // 알 수 없는 세션 무시
    const f = useLogStore.getState().files[fileId];
    if (!f) return;

    const result = parseBatch(payload.lines, pendingByFile.get(fileId) ?? null, {
      fileIdSalt: fileId,
    });
    pendingByFile.set(fileId, result.pending);

    if (result.entries.length > 0) {
      useLogStore.getState().appendEntries(fileId, result.entries);

      // ERROR/FATAL 토스트 (rate limit + errorToast 설정)
      const { errorToast: errorToastEnabled } = useSettingsStore.getState();
      if (errorToastEnabled) {
        const rl = getRateLimiter(fileId);
        for (const entry of result.entries) {
          if (entry.level === "ERROR" || entry.level === "FATAL") {
            const key = entry.exceptionClass ?? entry.logger ?? "ERROR";
            if (rl.allow(key)) {
              toast.error(entry.exceptionClass ?? "ERROR", {
                description: i18n.t("realtime.toastErrorDescription"),
              });
            }
          }
        }
      }

      // 자동 스크롤 일시정지 상태면 pending 카운트 증가 (탭-스코프)
      if (f.autoScrollPaused) {
        useLogStore
          .getState()
          .patchTabUi(fileId, {
            pendingNewLineCount:
              (f.pendingNewLineCount ?? 0) + result.entries.length,
          });
      }
    }

    if (payload.droppedCount > 0) {
      const ds = getDroppedState(fileId);
      const now = Date.now();
      if (now - ds.lastAt >= DROPPED_TOAST_MIN_INTERVAL_MS) {
        ds.lastAt = now;
        toast.warning(
          i18n.t("realtime.droppedLogs", { count: payload.droppedCount }),
        );
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const register = async () => {
      try {
        const u1 = await listen<LineAddedPayload>(
          WATCH_EVENTS.LINE_ADDED,
          (event) => {
            handleLineAdded(event.payload);
          },
        );
        const u2 = await listen<RotatedPayload>(WATCH_EVENTS.ROTATED, (event) => {
          const fileId = sessionToFileId.get(event.payload.sessionId);
          if (!fileId) return;
          useUiStore.getState().showRotationBanner(event.payload.reason);
          pendingByFile.set(fileId, null);
        });
        const u3 = await listen<WatchErrorPayload>(
          WATCH_EVENTS.ERROR,
          (event) => {
            const fileId = sessionToFileId.get(event.payload.sessionId);
            if (!fileId) return;
            const labelKey = ERROR_LABEL_KEYS[event.payload.error.code];
            const label = labelKey
              ? i18n.t(labelKey)
              : i18n.t("realtime.errorWatchGeneric");
            useLogStore.getState().setWatchError(fileId, label);
            toast.error(label);
            if (event.payload.fatal) {
              useLogStore.getState().setWatchMode(fileId, "error");
            }
          },
        );
        const u4 = await listen<StoppedPayload>(
          WATCH_EVENTS.STOPPED,
          (event) => {
            const fileId = sessionToFileId.get(event.payload.sessionId);
            if (!fileId) return;
            useLogStore.getState().setWatchMode(fileId, "idle");
            sessionToFileId.delete(event.payload.sessionId);
            const wp = useLogStore.getState().files[fileId]?.watchPath ?? null;
            useLogStore.getState().setWatchSession(fileId, null, wp);
            pendingByFile.set(fileId, null);
          },
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
          /* noop */
        }
      });
      unlistenersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─────────────────────────────────────────────────────────────────────
// 2) 액션 전용 훅 — 어느 컴포넌트든 호출 가능 (listen 없음)
// ─────────────────────────────────────────────────────────────────────

export interface UseLogWatchActions {
  /** 새 live 탭으로 감시 시작 (드롭/버튼). 같은 경로면 기존 탭 포커스 */
  startWatchAsTab: (pathArg?: string) => Promise<void>;
  /** 활성 live watcher 정리 */
  stop: () => Promise<void>;
}

export function useLogWatchActions(): UseLogWatchActions {
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
      toast.error(i18n.t("sidebar.fileSelectFailed"), { description: String(e) });
      return null;
    }
  }, []);

  const startWatchAsTab = useCallback(
    async (pathArg?: string): Promise<void> => {
      const path = pathArg ?? (await pickFile());
      if (!path) return;

      // 메타 선검사 (500MB/권한 등 사전 차단)
      try {
        await invoke("get_file_metadata", { path });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(i18n.t("sidebar.fileOpenFailed"), { description: msg });
        return;
      }

      const norm = path.replace(/\\/g, "/");
      const { files, fileOrder, addFileTab, setActiveFileId } =
        useLogStore.getState();

      // 같은 경로 live 탭 재드롭 → 포커스
      const matched = fileOrder.find(
        (id) => files[id].kind === "live" && files[id].watchPath === norm,
      );
      if (matched) {
        setActiveFileId(matched);
        await activateLiveTab(matched);
        return;
      }

      // 신규 live 탭 생성 + 활성화
      const fileId = crypto.randomUUID();
      const baseName = path.split(/[\\/]/).pop() ?? path;
      addFileTab({
        fileId,
        kind: "live",
        fileName: baseName,
        filePath: norm,
        fileSize: 0,
      });
      setActiveFileId(fileId);
      await activateLiveTab(fileId);
    },
    [pickFile],
  );

  const stop = useCallback(async (): Promise<void> => {
    await teardownActiveWatcher();
  }, []);

  return { startWatchAsTab, stop };
}

// ─────────────────────────────────────────────────────────────────────
// 호환 re-export — 기존 import 경로 보존
// ─────────────────────────────────────────────────────────────────────

/**
 * @deprecated useLogWatchController + useLogWatchActions 로 분리됨.
 */
export const useLogWatch = useLogWatchController;
