// 모드 전환 훅
// - 파일 분석 ↔ 실시간 감시 모드 전환 오케스트레이션
// - 데이터가 있으면 ConfirmDialog 요청, 없으면 즉시 전환
// - 전환 시: 감시 중지 → logStore.reset → resetFileScopedUi
//   → 마지막에 target 모드 세팅 (BL-05: resetFileScopedUi 가 file 로 덮어쓰는 순서 고려)

import { useCallback, useRef, useState } from "react";

import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";
import { useLogWatchActions } from "./useLogWatch";

export type ModeTarget = "file" | "live";

interface RequestSwitchOptions {
  triggerRef?: HTMLElement | null;
}

export interface UseModeSwitch {
  requestSwitch: (target: ModeTarget, opts?: RequestSwitchOptions) => void;
  confirmOpen: boolean;
  pendingTarget: ModeTarget | null;
  confirmSwitch: () => Promise<void>;
  /** 데이터 유지한 채 모드만 전환 */
  keepDataSwitch: () => void;
  cancelSwitch: () => void;
  isSwitching: boolean;
}

export function useModeSwitch(): UseModeSwitch {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ModeTarget | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  // store 상태는 개별 selector 로 분할 구독
  const watchMode = useLogStore((s) => s.watchMode);
  const isParsing = useLogStore((s) => s.isParsing);
  const entriesLen = useLogStore((s) => s.entries.length);
  const appMode = useUiStore((s) => s.appMode);

  const { start, stop } = useLogWatchActions();

  const hasFileData = entriesLen > 0 || isParsing;
  const hasLiveSession =
    watchMode === "watching" || watchMode === "starting";
  const hasData = hasFileData || hasLiveSession;

  const performSwitch = useCallback(
    async (target: ModeTarget): Promise<void> => {
      setIsSwitching(true);
      try {
        // 1) 감시 세션 중지 (idle 이 아니면 항상 시도)
        const currentWatch = useLogStore.getState().watchMode;
        if (currentWatch !== "idle") {
          try {
            await stop();
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn("[useModeSwitch] stop 실패", e);
            }
          }
        }
        // 2) 로그 저장소 초기화
        useLogStore.getState().reset();
        // 3) 파일 스코프 UI 초기화 (이 함수가 appMode='file', mainView='stacktrace' 로 덮어씀)
        useUiStore.getState().resetFileScopedUi();
        // 4) BL-05: 반드시 resetFileScopedUi 이후에 target 모드 세팅
        useUiStore.getState().requestModeChange({
          appMode: target,
          mainView: target === "live" ? "liveLog" : "stacktrace",
        });
      } finally {
        setIsSwitching(false);
        setConfirmOpen(false);
        setPendingTarget(null);
        // 트리거 요소로 포커스 복귀
        setTimeout(() => triggerRef.current?.focus(), 0);
      }
    },
    [stop]
  );

  const requestSwitch = useCallback(
    (target: ModeTarget, opts?: RequestSwitchOptions): void => {
      if (isSwitching) return;
      const hasActiveToolTab = useUiStore.getState().activeToolTab !== null;

      // 동일 모드 + 도구 탭 활성 → 도구 탭 해제만 (데이터 유지, 확인 불필요)
      if (target === appMode && hasActiveToolTab) {
        useUiStore.getState().requestModeChange({
          appMode: target,
          mainView: target === "live" ? "liveLog" : "stacktrace",
        });
        return;
      }

      // 동일 모드면 no-op
      if (target === appMode) return;

      // 트리거 요소 기록 (포커스 복귀용)
      triggerRef.current =
        opts?.triggerRef ?? (document.activeElement as HTMLElement | null);

      if (!hasData) {
        // 데이터 없음 → 즉시 전환 (확인 불필요)
        void performSwitch(target);
      } else {
        // 실제 데이터 있음 → 확인 다이얼로그
        setPendingTarget(target);
        setConfirmOpen(true);
      }
    },
    [appMode, hasData, isSwitching, performSwitch]
  );

  const confirmSwitch = useCallback(async (): Promise<void> => {
    if (pendingTarget) {
      await performSwitch(pendingTarget);
    }
  }, [pendingTarget, performSwitch]);

  // 데이터 유지한 채 모드만 전환 (감시 중지 + entries 유지 + 모드 변경)
  const keepDataSwitch = useCallback((): void => {
    if (!pendingTarget) return;
    const filePath = useLogStore.getState().filePath ?? useLogStore.getState().watchPath;
    // 감시 중이면 중지
    const currentWatch = useLogStore.getState().watchMode;
    if (currentWatch !== "idle") {
      void stop();
    }
    // entries/analysis 유지, 모드만 변경
    useUiStore.getState().requestModeChange({
      appMode: pendingTarget,
      mainView: pendingTarget === "live" ? "liveLog" : "stacktrace",
    });
    // live 전환 시 파일 경로가 있으면 자동 감시 시작
    if (pendingTarget === "live" && filePath) {
      void start(filePath);
    }
    setConfirmOpen(false);
    setPendingTarget(null);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [pendingTarget, start, stop]);

  const cancelSwitch = useCallback((): void => {
    setConfirmOpen(false);
    setPendingTarget(null);
  }, []);

  return {
    requestSwitch,
    confirmOpen,
    pendingTarget,
    confirmSwitch,
    keepDataSwitch,
    cancelSwitch,
    isSwitching,
  };
}
