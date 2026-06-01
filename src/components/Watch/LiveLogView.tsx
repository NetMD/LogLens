// 실시간 로그 가상 스크롤 뷰
// - @tanstack/react-virtual 로 100k+ 엔트리 렌더링
// - 120px 하단 임계로 자동 스크롤 일시정지 감지
// - RotationBanner / FloatingActionButton 포함

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLogStore } from "../../store/logStore";
import { useActiveFile, useActiveFileEntries } from "../../store/activeFileSelectors";
import { EmptyLiveState } from "../shared/EmptyLiveState";
import { FloatingActionButton } from "../shared/FloatingActionButton";
import { RotationBanner } from "./RotationBanner";

const AUTO_SCROLL_THRESHOLD_PX = 120;
const ROW_ESTIMATE_PX = 56;

const LEVEL_CLASS: Record<string, string> = {
  ERROR: "text-[var(--color-status-error-fg)]",
  FATAL: "text-[var(--color-status-error-fg)] font-semibold",
  WARN: "text-[var(--color-status-warn-fg)]",
  INFO: "text-[var(--color-text-secondary)]",
  DEBUG: "text-[var(--color-text-tertiary)]",
  TRACE: "text-[var(--color-text-disabled)]",
};

export function LiveLogView() {
  const { t } = useTranslation();
  const entries = useActiveFileEntries();
  const activeFileId = useLogStore((s) => s.activeFileId);
  const autoScrollPaused = useActiveFile()?.autoScrollPaused ?? false;
  const pendingNewLineCount = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.pendingNewLineCount ?? 0 : 0,
  );
  const setAutoScrollPaused = (paused: boolean) => {
    if (activeFileId)
      useLogStore.getState().patchTabUi(activeFileId, { autoScrollPaused: paused });
  };
  const resetPendingNewLineCount = () => {
    if (activeFileId)
      useLogStore.getState().patchTabUi(activeFileId, { pendingNewLineCount: 0 });
  };

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // 스크롤 위치 기반 auto-scroll pause 감지 (rAF 스로틀)
  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = parentRef.current;
      if (!el) return;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      const shouldPause = distanceFromBottom > AUTO_SCROLL_THRESHOLD_PX;
      const { activeFileId: fid, files, patchTabUi } = useLogStore.getState();
      if (!fid) return;
      const cur = files[fid]?.autoScrollPaused ?? false;
      if (shouldPause !== cur) {
        patchTabUi(fid, {
          autoScrollPaused: shouldPause,
          ...(shouldPause ? {} : { pendingNewLineCount: 0 }),
        });
      }
    });
  }, []);

  // entries 변화 시 자동 스크롤 (일시정지 아니면)
  useEffect(() => {
    if (autoScrollPaused) return;
    if (entries.length === 0) return;
    rowVirtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    // rowVirtualizer 는 매 렌더 새 인스턴스이므로 의존성에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, autoScrollPaused]);

  const scrollToBottom = useCallback(() => {
    if (entries.length === 0) return;
    rowVirtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    resetPendingNewLineCount();
    setAutoScrollPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, resetPendingNewLineCount, setAutoScrollPaused]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[var(--color-bg-base)] log-viewer-font log-viewer-area"
        role="log"
        aria-live="off"
        aria-label={t('sidebar.realtimeLog')}
      >
        {entries.length === 0 ? (
          <EmptyLiveState
            title={t('realtime.emptyTitle')}
            description={t('realtime.emptyDesc')}
          />
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((vi) => {
              const entry = entries[vi.index];
              if (!entry) return null;
              return (
                <div
                  key={entry.id}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: `translateY(${vi.start}px)`,
                    width: "100%",
                  }}
                  className="px-4 py-1 border-b border-[var(--color-border-subtle)]"
                >
                  <div className="flex gap-2 items-start">
                    <span className="text-[var(--color-text-disabled)] flex-shrink-0">
                      {entry.timestamp}
                    </span>
                    <span
                      className={`flex-shrink-0 w-12 ${
                        LEVEL_CLASS[entry.level] ?? "text-[var(--color-text-tertiary)]"
                      }`}
                    >
                      {entry.level}
                    </span>
                    <span className="text-[var(--color-text-tertiary)] flex-shrink-0 truncate max-w-[180px]">
                      [{entry.thread}]
                    </span>
                    <span className="text-[var(--color-accent-primary)] flex-shrink-0 truncate max-w-[200px]">
                      {entry.logger}
                    </span>
                    <span className="text-[var(--color-text-primary)] break-words min-w-0 flex-1">
                      {entry.message}
                    </span>
                  </div>
                  {entry.exceptionClass && (
                    <div className="mt-0.5 pl-4 text-[var(--color-status-error-fg)]">
                      {entry.exceptionClass}
                      {entry.exceptionMessage ? `: ${entry.exceptionMessage}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RotationBanner />
      <FloatingActionButton
        count={pendingNewLineCount}
        onClick={scrollToBottom}
      />
    </div>
  );
}
