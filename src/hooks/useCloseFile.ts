// 파일/감시 세션 해제 훅
// - 감시 중이거나 파싱 중이면 ConfirmDialog 를 띄우고, 아니면 즉시 해제
// - 해제 시: stop_watch (필요 시) → logStore.reset() → uiStore.resetFileScopedUi()

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";
import { useLogWatchActions } from "./useLogWatch";

export function useCloseFile() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const { stop } = useLogWatchActions();

  const doClose = useCallback(async () => {
    setIsClosing(true);
    try {
      const { watchMode } = useLogStore.getState();
      if (watchMode !== "idle") {
        await stop();
      }
      useLogStore.getState().reset();
      useUiStore.getState().resetFileScopedUi();
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[useCloseFile] 파일 해제 실패", e);
      }
      toast.error("파일을 해제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsClosing(false);
      setConfirmOpen(false);
      // 트리거 요소로 포커스 복귀
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, [stop]);

  const close = useCallback(() => {
    const { watchMode, isParsing } = useLogStore.getState();
    const needsConfirm =
      watchMode === "watching" || watchMode === "starting" || isParsing;
    triggerRef.current = document.activeElement as HTMLElement | null;
    if (needsConfirm) {
      setConfirmOpen(true);
    } else {
      void doClose();
    }
  }, [doClose]);

  const confirmClose = useCallback(() => {
    void doClose();
  }, [doClose]);

  const cancelClose = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return {
    close,
    confirmOpen,
    confirmClose,
    cancelClose,
    isClosing,
    triggerRef,
  };
}
