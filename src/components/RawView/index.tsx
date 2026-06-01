// RawView — 원본 로그 보기 (R13 §5)
// A/B 데이터소스 추상화 + @tanstack/react-virtual 가상 스크롤(G-3) + 라인번호 거터
// + 줄바꿈 기본/가로스크롤 토글(Q-D1) + 고아 라인 거터 마커.
// A안(≤100MB): rawLines 버퍼 지연 생성. B안(>100MB): invoke(build_raw_line_index/read_raw_window) 윈도우 렌더.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileSearch } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useActiveFile } from "../../store/activeFileSelectors";
import { useLogStore } from "../../store/logStore";
import { streamFileInto } from "../../hooks/useLogFile";
import {
  RAW_VIEW_COMMANDS,
  type LineIndexMeta,
  type RawWindowResponse,
} from "../../contracts/rawViewEvents";

const ROW_ESTIMATE_PX = 22;
const WINDOW_BUFFER = 100; // 가시 범위 ± buffer

// A/B 추상 인터페이스 (UX §7-2)
interface RawDataSource {
  lineCount: number;
  getLine(index: number): string | undefined;
  ensureWindow?(startLine: number, endLine: number): void;
}

export function RawView() {
  const { t } = useTranslation();
  const activeFile = useActiveFile();
  const fileId = activeFile?.fileId ?? null;
  const rawLines = activeFile?.rawLines;
  const rawSource = activeFile?.rawSource;
  const rawLineIndex = activeFile?.rawLineIndex;
  const filePath = activeFile?.filePath ?? null;
  const fileSize = activeFile?.fileSize ?? 0;
  const parseFailCount = activeFile?.parseFailCount ?? 0;

  const [wrap, setWrap] = useState(true); // 줄바꿈 기본 (Q-D1)
  const [bSessionId, setBSessionId] = useState<string | null>(null);
  const [bLineCount, setBLineCount] = useState(0);
  const [bLoadError, setBLoadError] = useState<string | null>(null);
  const [isLoadingWindow, setIsLoadingWindow] = useState(false);
  // B안 윈도우 캐시 (lineNo → string)
  const windowCacheRef = useRef<Map<number, string>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0); // 캐시 갱신 트리거
  const inflightRef = useRef<Set<number>>(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  const RAW_INLINE_THRESHOLD = 100 * 1024 * 1024;
  const isBMode = rawSource === "B" || fileSize > RAW_INLINE_THRESHOLD;

  // ── A안: rawLines 지연 생성 (회수/미생성 시 재스트리밍) ──
  useEffect(() => {
    if (!fileId || isBMode) return;
    if (rawLines !== undefined) return; // 이미 적재됨
    if (!filePath) return;
    // Raw 보기 연 탭 한정 재스트리밍 (collectRaw)
    void streamFileInto(fileId, filePath, { collectRaw: true });
  }, [fileId, isBMode, rawLines, filePath]);

  // ── B안: 인덱스 1회 풀스캔 (build_raw_line_index) ──
  useEffect(() => {
    if (!fileId || !isBMode || !filePath) return;
    if (bSessionId) return;
    let cancelled = false;
    setBLoadError(null);
    invoke<LineIndexMeta>(RAW_VIEW_COMMANDS.BUILD_LINE_INDEX, { path: filePath })
      .then((meta) => {
        if (cancelled) return;
        setBSessionId(meta.sessionId);
        setBLineCount(meta.lineCount);
        useLogStore.getState().setRawLineIndex(fileId, meta.lineCount, "B");
      })
      .catch((e) => {
        if (cancelled) return;
        setBLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, isBMode, filePath, bSessionId]);

  // ── B안 윈도우 fetch (debounce 가시 범위 ± buffer) ──
  const ensureWindow = useCallback(
    (startLine: number, endLine: number) => {
      if (!bSessionId) return;
      const from = Math.max(0, startLine - WINDOW_BUFFER);
      const to = Math.min(bLineCount, endLine + WINDOW_BUFFER);
      // 미캐시 구간 판정
      let needFetch = false;
      for (let i = from; i < to; i++) {
        if (!windowCacheRef.current.has(i) && !inflightRef.current.has(i)) {
          needFetch = true;
          break;
        }
      }
      if (!needFetch) return;
      for (let i = from; i < to; i++) inflightRef.current.add(i);
      setIsLoadingWindow(true);
      invoke<RawWindowResponse>(RAW_VIEW_COMMANDS.READ_RAW_WINDOW, {
        sessionId: bSessionId,
        startLine: from,
        endLine: to,
      })
        .then((resp) => {
          resp.lines.forEach((line, idx) => {
            windowCacheRef.current.set(resp.startLine + idx, line);
          });
          setCacheVersion((v) => v + 1);
          setBLoadError(null);
        })
        .catch((e) => {
          setBLoadError(String(e));
        })
        .finally(() => {
          for (let i = from; i < to; i++) inflightRef.current.delete(i);
          setIsLoadingWindow(false);
        });
    },
    [bSessionId, bLineCount],
  );

  // ── 데이터소스 추상화 ──
  const dataSource: RawDataSource = useMemo(() => {
    if (isBMode) {
      return {
        lineCount: bLineCount || rawLineIndex || 0,
        getLine: (i: number) => windowCacheRef.current.get(i),
        ensureWindow,
      };
      // cacheVersion 을 deps 에 두어 캐시 갱신 시 재계산
    }
    const lines = rawLines ?? [];
    return {
      lineCount: lines.length,
      getLine: (i: number) => lines[i],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBMode, bLineCount, rawLineIndex, rawLines, ensureWindow, cacheVersion]);

  const virtualizer = useVirtualizer({
    count: dataSource.lineCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 12,
    measureElement: wrap ? (el) => el.getBoundingClientRect().height : undefined,
  });

  // B안 가시 범위 윈도우 트리거
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (!isBMode || virtualItems.length === 0) return;
    const first = virtualItems[0].index;
    const last = virtualItems[virtualItems.length - 1].index;
    dataSource.ensureWindow?.(first, last);
  }, [isBMode, virtualItems, dataSource]);

  const gutterWidth = `${Math.max(4, String(dataSource.lineCount).length + 1)}ch`;

  // 빈 상태 (EX-09)
  if (!activeFile) {
    return null;
  }
  if (!isBMode && (rawLines?.length ?? 0) === 0 && rawLines !== undefined) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
        <FileSearch className="w-8 h-8 text-[var(--color-text-tertiary)]" aria-hidden="true" />
        <p className="text-sm text-[var(--color-text-tertiary)]">{t("rawView.empty")}</p>
        <p className="text-xs text-[var(--color-text-disabled)]">{t("rawView.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden log-viewer-area bg-[var(--color-bg-base)]">
      {/* 상단 메타 바 (고아 라인 카운트 또는 토글) */}
      <div className="px-4 py-1.5 border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-text-tertiary)] flex items-center justify-between flex-shrink-0">
        <span>
          {parseFailCount > 0
            ? t("rawView.orphanCount", { count: parseFailCount.toLocaleString() })
            : ""}
        </span>
        <button
          type="button"
          onClick={() => setWrap((w) => !w)}
          className="px-2 py-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
        >
          {wrap ? t("rawView.wrapLines") : t("rawView.noWrap")}
        </button>
      </div>

      {/* B안 로드 에러 (인라인 + 재시도) */}
      {bLoadError && (
        <div className="px-4 py-2 border-b border-[var(--color-border-subtle)] text-xs text-[var(--color-status-error-fg)] flex items-center justify-between flex-shrink-0">
          <span>{t("rawView.loadError")}</span>
          <button
            type="button"
            disabled={rawSource !== "B" || isLoadingWindow}
            onClick={() => {
              setBLoadError(null);
              setBSessionId(null); // 인덱스 재생성 트리거
            }}
            className="px-2 py-0.5 rounded border border-[var(--color-status-error-border)] disabled:opacity-50"
          >
            {t("rawView.retry")}
          </button>
        </div>
      )}

      <div
        ref={parentRef}
        className={`flex-1 overflow-auto ${wrap ? "" : "overflow-x-auto"}`}
        role="log"
        aria-label={t("rawView.tabAria")}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((vi) => {
            const line = dataSource.getLine(vi.index);
            const isPending = line === undefined; // B안 미도착
            return (
              <div
                key={vi.index}
                data-index={vi.index}
                ref={wrap ? virtualizer.measureElement : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
                className="flex hover:bg-[var(--color-bg-hover)]"
              >
                <span
                  aria-label={t("rawView.lineNumberAria")}
                  className="flex-shrink-0 text-right pr-3 text-[var(--color-text-tertiary)] tabular-nums select-none bg-[var(--color-bg-surface)] border-r border-[var(--color-border-subtle)] sticky left-0"
                  style={{ minWidth: gutterWidth }}
                >
                  {vi.index + 1}
                </span>
                <span
                  className={`log-viewer-font pl-2 ${
                    isPending
                      ? "text-[var(--color-text-disabled)]"
                      : "text-[var(--color-text-primary)]"
                  } ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
                >
                  {isPending ? "░░░ " + t("rawView.loading") : line}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
