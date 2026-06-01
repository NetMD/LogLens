import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLogStore } from "../../store/logStore";
import {
  useActiveFileEntries,
  useActiveFileIsParsing,
  useActiveFile,
} from "../../store/activeFileSelectors";
import { useSettingsStore } from "../../store/settingsStore";
import { StackTraceCard } from "./StackTraceCard";
import type { LogLevel } from "../../utils/logParser";

const DEBUG_LEVELS: LogLevel[] = ["DEBUG", "TRACE"];

// label 은 i18n 키 문자열. 렌더 시점에 t() 변환 — useMemo deps 에 t() 결과 넣지 않음 (큐레이터 제약 #3).
function getLevelFilterOptions(showDebug: boolean): { labelKey: string; value: LogLevel | "ALL" }[] {
  const base: { labelKey: string; value: LogLevel | "ALL" }[] = [
    { labelKey: "stackTrace.allLevels", value: "ALL" },
    { labelKey: "errorPattern.errors", value: "ERROR" },
    { labelKey: "errorPattern.warnings", value: "WARN" },
    { labelKey: "errorPattern.info", value: "INFO" },
  ];
  if (showDebug) {
    base.push({ labelKey: "errorPattern.debug", value: "DEBUG" });
    base.push({ labelKey: "errorPattern.trace", value: "TRACE" });
  }
  return base;
}

export function StackTraceView() {
  // [큐레이터 제약 P0] t() 호출은 컴포넌트 최상단에서만. useMemo deps 에는 t 자체도 포함 금지.
  const { t } = useTranslation();
  // selector 분리 — store 의 다른 필드(progress 등) 변경으로 인한 리렌더 차단
  const entries = useActiveFileEntries();
  const isParsing = useActiveFileIsParsing();
  const activeFileId = useLogStore((s) => s.activeFileId);
  const progress = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.progress ?? 0 : 0,
  );
  // 탭-스코프 UI (FileLogState 에 보존 §2.5) — searchQuery 와 levelFilter 동형:
  // 활성 파일의 단일 필드 셀렉터로 읽고(전체구독 금지 G-1), patchTabUi 로 활성 fileId 에 기록.
  // App.tsx 가 <StackTraceView /> 를 key 없이 렌더해 탭 전환 시 인스턴스를 재사용하므로,
  // 활성 fileId 가 바뀌면 셀렉터가 해당 탭의 보존값을 자동 반영 → 탭별 보존/복원 + 누수 차단.
  const searchQuery = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.searchQuery ?? "" : "",
  );
  const levelFilter = useLogStore((s) =>
    s.activeFileId ? s.files[s.activeFileId]?.levelFilter ?? "ALL" : "ALL",
  );
  const selectedEntryId = useActiveFile()?.selectedEntryId ?? null;
  const setSearchQuery = (q: string) => {
    if (activeFileId) useLogStore.getState().patchTabUi(activeFileId, { searchQuery: q });
  };
  const setLevelFilter = (value: LogLevel | "ALL") => {
    if (activeFileId) useLogStore.getState().patchTabUi(activeFileId, { levelFilter: value });
  };
  const showDebugLog = useSettingsStore((s) => s.showDebugLog);

  // 가상 스크롤 컨테이너 ref — 30,000 카드 전체 마운트 회피 (화면에 보이는 ~20개만)
  const parentRef = useRef<HTMLDivElement>(null);

  const levelFilterOptions = useMemo(() => getLevelFilterOptions(showDebugLog), [showDebugLog]);

  const filtered = useMemo(() => {
    // 파싱 진행 중에는 30,000+ entries 의 3중 filter + 30,000 카드 reconciliation 회피.
    // 완료 후 1회만 계산되어 메인 스레드 블로킹 제거.
    if (isParsing) return [];

    let result = entries;

    // 설정에서 DEBUG/TRACE 비활성화 시 필터링 (전체 보기에서도 제외)
    if (!showDebugLog) {
      result = result.filter((e) => !DEBUG_LEVELS.includes(e.level));
    }

    if (levelFilter !== "ALL") {
      result = result.filter((e) => e.level === levelFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.exceptionClass?.toLowerCase().includes(q) ?? false) ||
          e.logger.toLowerCase().includes(q)
      );
    }

    return result;
  }, [entries, levelFilter, searchQuery, showDebugLog, isParsing]);

  // 가변 높이(펼침 상태) 카드 — measureElement 로 동적 측정
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,   // 접힌 카드 평균 높이 — measureElement 로 자동 보정
    overscan: 6,
  });

  // selectedEntryId(예: TopErrorList 의 "Top 에러 클릭") → 가상 스크롤 환경에서 해당 인덱스로 스크롤.
  // useScrollToError 의 DOM scrollIntoView 는 화면 밖 카드에는 작동하지 않으므로 인덱스 기반 보강.
  useEffect(() => {
    if (!selectedEntryId || isParsing || filtered.length === 0) return;
    const idx = filtered.findIndex((e) => e.id === selectedEntryId);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: "center" });
    }
  }, [selectedEntryId, filtered, isParsing, virtualizer]);

  return (
    <div className="flex flex-col h-full">
      {/* 필터 바 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-default)] flex-shrink-0">
        <div className="flex gap-1">
          {levelFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLevelFilter(opt.value)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                levelFilter === opt.value
                  ? "bg-[var(--color-button-primary-bg)] text-white"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-xs relative">
          <svg
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('fileAnalysis.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-disabled)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)]/30"
          />
        </div>

        <span className="text-xs text-[var(--color-text-disabled)] ml-auto">
          {isParsing
            ? t('stackTrace.collecting', { count: entries.length.toLocaleString() })
            : t('stackTrace.filteredOf', {
                filtered: filtered.length.toLocaleString(),
                total: entries.length.toLocaleString(),
              })}
        </span>
      </div>

      {/* 리스트 — 파싱 중에는 카드 reconciliation 회피용 자리표시자, 그 외엔 가상 스크롤 */}
      <div ref={parentRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isParsing ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-[var(--color-text-disabled)]">
            <div>{t('stackTrace.parseProgress', { progress })}</div>
            <div className="text-xs">{t('stackTrace.parseProgressDesc')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-disabled)]">
            {searchQuery || levelFilter !== "ALL"
              ? t('stackTrace.noResults')
              : t('fileAnalysis.noEntries')}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const entry = filtered[vi.index];
              return (
                <div
                  key={entry.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                    paddingBottom: "8px", // 기존 space-y-2 대체
                  }}
                >
                  <StackTraceCard entry={entry} entries={entries} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
