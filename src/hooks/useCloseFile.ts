// 탭 닫기 훅 (R13 fileId 스코프) — 설계 §흐름3, BL-08
// - needsCloseConfirm(fileId) 이면 ConfirmDialog, 아니면 즉시 닫기
// - 닫기 시: live 면 watch 정리, 진단 abort+delete, Export state delete, files/fileOrder 제거
// - 활성 탭이었으면 인접 탭으로 전환 (오른쪽 우선)

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import i18n from "../i18n";
import { useLogStore } from "../store/logStore";
import { useUiStore } from "../store/uiStore";
import { useExportStore } from "../store/exportStore";
import { needsCloseConfirm } from "../store/activeFileSelectors";
import {
  teardownActiveWatcher,
  activateLiveTab,
} from "./useLogWatch";
import { abortDiagnosis } from "./useDiagnosis";

export function useCloseFile() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const doClose = useCallback(async (fileId: string) => {
    setIsClosing(true);
    try {
      const { files, fileOrder, activeFileId } = useLogStore.getState();
      const target = files[fileId];
      if (!target) return;

      // live 탭이면 watcher 정리
      if (
        target.kind === "live" &&
        (target.watchMode === "watching" || target.watchMode === "starting")
      ) {
        await teardownActiveWatcher();
      }

      // 진단/Export 상태 정리
      abortDiagnosis(fileId);
      useUiStore.getState().removeDiagnosis(fileId);
      useExportStore.getState().removeFileState(fileId);

      const wasActive = activeFileId === fileId;
      const idx = fileOrder.indexOf(fileId);

      // files/fileOrder 제거
      useLogStore.getState().removeFileTab(fileId);

      if (wasActive) {
        const newOrder = useLogStore.getState().fileOrder;
        // 오른쪽 인접 ?? 왼쪽 인접 ?? null
        const next = newOrder[idx] ?? newOrder[idx - 1] ?? null;
        useLogStore.getState().setActiveFileId(next);
        if (next) {
          useExportStore.getState().setCurrentFileId(next);
          const nf = useLogStore.getState().files[next];
          if (nf?.kind === "live") {
            void activateLiveTab(next);
          }
        } else {
          useExportStore.getState().setCurrentFileId(null);
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[useCloseFile] 탭 닫기 실패", e);
      }
      toast.error(i18n.t("sidebar.fileReleaseFailed"));
    } finally {
      setIsClosing(false);
      setConfirmOpen(false);
      setPendingFileId(null);
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  /** 탭 닫기 요청 (fileId). 활성 탭 닫기는 fileId 생략 시 activeFileId 사용 */
  const close = useCallback(
    (fileId?: string) => {
      const fid = fileId ?? useLogStore.getState().activeFileId;
      if (!fid) return;
      const { files } = useLogStore.getState();
      const { byFile } = useExportStore.getState();
      const { diagnoses } = useUiStore.getState();
      const needsConfirm = needsCloseConfirm(fid, files, byFile, diagnoses);
      triggerRef.current = document.activeElement as HTMLElement | null;
      if (needsConfirm) {
        setPendingFileId(fid);
        setConfirmOpen(true);
      } else {
        void doClose(fid);
      }
    },
    [doClose],
  );

  const confirmClose = useCallback(() => {
    if (pendingFileId) void doClose(pendingFileId);
  }, [doClose, pendingFileId]);

  const cancelClose = useCallback(() => {
    setConfirmOpen(false);
    setPendingFileId(null);
  }, []);

  return {
    close,
    confirmOpen,
    confirmClose,
    cancelClose,
    isClosing,
    triggerRef,
    pendingFileId,
  };
}
