import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AnalysisResult } from "../../utils/errorAnalyzer";
import { useScrollToError } from "../../hooks/useScrollToError";
import { useActiveFileEntries } from "../../store/activeFileSelectors";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore, useActiveDiagnosisViewOpen } from "../../store/uiStore";
import type { ExceptionDiagnosisInput } from "../../types/diagnosis";
import type { LogEntry } from "../../utils/logParser";
import { Tooltip } from "../shared/Tooltip";

interface Props {
  analysis: AnalysisResult;
}

export function TopErrorList({ analysis }: Props) {
  const { t } = useTranslation();
  const { scrollToEntry } = useScrollToError();
  const { topErrors } = analysis;
  const entries = useActiveFileEntries();
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const openDiagnosis = useUiStore((s) => s.openDiagnosis);
  const isDiagnosisViewOpen = useActiveDiagnosisViewOpen();

  if (topErrors.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-disabled)] py-6 text-center">
        {t('errorPattern.noStackTraces')}
      </div>
    );
  }

  const maxCount = topErrors[0].count;

  // AI 진단 버튼 disabled 여부
  const isAiDisabled = !aiProvider || isDiagnosisViewOpen;
  const tooltipContent = !aiProvider
    ? t('stackTrace.providerRequired')
    : isDiagnosisViewOpen
      ? t('stackTrace.analyzingInProgress')
      : null;

  // AI 진단 핸들러: ExceptionDiagnosisInput 구성
  const handleDiagnose = (err: typeof topErrors[0], e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAiDisabled) return;

    // 해당 exceptionClass의 모든 LogEntry 추출
    const matchingEntries = entries.filter(
      (entry) => entry.exceptionClass === err.exceptionClass
    );

    // 각 에러의 전후 5줄 relatedLogs 슬라이스
    const relatedLogs: LogEntry[] = [];
    const addedIds = new Set<string>();
    for (const entry of matchingEntries) {
      const idx = entries.indexOf(entry);
      const start = Math.max(0, idx - 5);
      const end = Math.min(entries.length, idx + 6);
      for (let i = start; i < end; i++) {
        if (!addedIds.has(entries[i].id)) {
          addedIds.add(entries[i].id);
          relatedLogs.push(entries[i]);
        }
      }
    }

    // 스택트레이스 추출
    const stackTraces = matchingEntries
      .filter((entry) => entry.stacktrace.length > 0)
      .map((entry) => entry.stacktrace);

    // 첫 번째/마지막 발생 시각
    const timestamps = matchingEntries.map((e) => e.timestamp).sort();
    const firstOccurrence = timestamps[0] ?? '';
    const lastOccurrence = timestamps[timestamps.length - 1] ?? '';

    const input: ExceptionDiagnosisInput = {
      type: 'exception',
      exceptionClass: err.exceptionClass.split('.').pop() ?? err.exceptionClass,
      fullName: err.exceptionClass,
      count: err.count,
      stackTraces,
      firstOccurrence,
      lastOccurrence,
      relatedLogs: relatedLogs.slice(0, 50), // 최대 50줄
    };

    openDiagnosis(input, 'errorPattern');
  };

  return (
    <div className="space-y-2">
      {topErrors.map((err, i) => (
        <div
          key={err.exceptionClass}
          role="button"
          tabIndex={0}
          aria-label={t('errorPattern.navigateToStackTrace', { exception: err.exceptionClass.split('.').pop() ?? err.exceptionClass })}
          className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]/60"
          onClick={() => scrollToEntry(err.sampleEntryId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              scrollToEntry(err.sampleEntryId);
            }
          }}
          title={t('errorPattern.clickToNavigate')}
        >
          {/* 순위 */}
          <span className="flex-shrink-0 text-xs font-mono text-[var(--color-text-disabled)] w-5 text-right">
            {i + 1}
          </span>

          {/* 예외 클래스명 + 바 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[var(--color-status-error-fg)] truncate">
                {err.exceptionClass.split(".").pop()}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--color-text-tertiary)] font-medium">
                  {t('errorPattern.countItems', { count: err.count.toLocaleString() })}
                </span>
                {/* AI 진단 버튼 */}
                <Tooltip content={tooltipContent} disabled={!tooltipContent}>
                  <button
                    onClick={(e) => handleDiagnose(err, e)}
                    disabled={isAiDisabled}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 bg-[var(--color-accent-primary)] text-white font-medium border border-[var(--color-accent-primary)] rounded px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-primary)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                    aria-label={t('stackTrace.aiDiagnoseLabel', { exception: err.exceptionClass.split('.').pop() ?? err.exceptionClass })}
                  >
                    <Sparkles className="w-3 h-3" />
                    {t('stackTrace.aiDiagnose')}
                  </button>
                </Tooltip>
              </div>
            </div>
            <div className="mt-1 h-1 bg-[var(--color-border-default)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-status-error-fg)] rounded-full transition-all"
                style={{ width: `${(err.count / maxCount) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[var(--color-text-disabled)] font-mono truncate" title={err.exceptionClass}>
                {err.exceptionClass}
              </span>
              <svg
                className="w-3 h-3 text-[var(--color-text-disabled)] group-hover:text-[var(--color-accent-primary)] flex-shrink-0 ml-1 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
