// 모드 전환 훅 (R13 — 다중 탭 모델로 단순화)
// 기존: 파일 ↔ 실시간 단일 모드 전환. R13: appMode 는 활성 탭 kind 파생이므로
// "모드 전환" = 해당 kind 의 새 파일 열기로 의미 변경.
// Sidebar 그룹 라벨 클릭 시 사용. ConfirmDialog 인터페이스는 호환 유지(이번엔 미발동).

import { useCallback, useRef, useState } from "react";

import { useLogFile } from "./useLogFile";
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
  keepDataSwitch: () => void;
  cancelSwitch: () => void;
  isSwitching: boolean;
}

export function useModeSwitch(): UseModeSwitch {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ModeTarget | null>(null);
  const [isSwitching] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const { loadFileAsTab } = useLogFile();
  const { startWatchAsTab } = useLogWatchActions();

  // 다중 탭 모델: 모드 전환 = 해당 kind 의 새 파일 열기 (드롭존 대신 파일 선택 다이얼로그)
  const requestSwitch = useCallback(
    (target: ModeTarget, opts?: RequestSwitchOptions): void => {
      triggerRef.current =
        opts?.triggerRef ?? (document.activeElement as HTMLElement | null);
      if (target === "live") {
        void startWatchAsTab();
      } else {
        void loadFileAsTab();
      }
    },
    [loadFileAsTab, startWatchAsTab],
  );

  const confirmSwitch = useCallback(async (): Promise<void> => {
    if (pendingTarget === "live") {
      await startWatchAsTab();
    } else {
      await loadFileAsTab();
    }
    setConfirmOpen(false);
    setPendingTarget(null);
  }, [pendingTarget, startWatchAsTab, loadFileAsTab]);

  const keepDataSwitch = useCallback((): void => {
    setConfirmOpen(false);
    setPendingTarget(null);
  }, []);

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
