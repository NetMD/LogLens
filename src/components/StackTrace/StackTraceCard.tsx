import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import type { LogEntry } from "../../utils/logParser";
import type { SingleDiagnosisInput } from "../../types/diagnosis";
import { StackTraceLine } from "./StackTraceLine";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";
import { Tooltip } from "../shared/Tooltip";

const LEVEL_STYLES: Record<string, string> = {
  ERROR: "bg-[var(--color-level-error-bg)] text-[var(--color-level-error-text)] border-[var(--color-level-error-border)]",
  FATAL: "bg-[var(--color-level-error-bg)] text-[var(--color-level-error-text)] border-[var(--color-level-error-border)]",
  WARN: "bg-[var(--color-level-warn-bg)] text-[var(--color-level-warn-text)] border-[var(--color-level-warn-border)]",
  INFO: "bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)] text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)] border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)]",
  DEBUG: "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] border-[var(--color-border-default)]",
  TRACE: "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] border-[var(--color-border-default)]",
};

const LEVEL_BADGE: Record<string, string> = {
  ERROR: "bg-[var(--color-status-error-bg)] bg-[var(--color-status-error-bg)] text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
  FATAL: "bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)] text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
  WARN: "bg-[var(--color-status-warn-bg)] dark:bg-[var(--color-status-warn-bg)] text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
  INFO: "bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)] text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
  DEBUG: "bg-[var(--color-border-default)] text-[var(--color-text-secondary)]",
  TRACE: "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)]",
};

interface Props {
  entry: LogEntry;
  entries?: LogEntry[];  // 전후 10줄 contextLogs 추출용
}

export function StackTraceCard({ entry, entries }: Props) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(
    entry.level === "ERROR" || entry.level === "FATAL"
  );

  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const openDiagnosis = useUiStore((s) => s.openDiagnosis);
  const isDiagnosisViewOpen = useUiStore((s) => s.isDiagnosisViewOpen);

  const hasStacktrace = entry.stacktrace.length > 0 || entry.exceptionClass;
  const borderStyle = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.INFO;
  const badgeStyle = LEVEL_BADGE[entry.level] ?? LEVEL_BADGE.INFO;
  const userFrameCount = entry.stacktrace.filter((f) => f.isUserCode).length;

  // ERROR/FATAL 카드에만 AI 진단 버튼 표시
  const showAiButton = entry.level === "ERROR" || entry.level === "FATAL";
  const isAiDisabled = !aiProvider || isDiagnosisViewOpen;
  const tooltipContent = !aiProvider
    ? t('stackTrace.providerRequired')
    : isDiagnosisViewOpen
      ? t('stackTrace.analyzingInProgress')
      : null;

  const handleDiagnose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAiDisabled) return;

    // 전후 10줄 contextLogs
    const contextLogs: LogEntry[] = [];
    if (entries) {
      const idx = entries.indexOf(entry);
      if (idx >= 0) {
        const start = Math.max(0, idx - 10);
        const end = Math.min(entries.length, idx + 11);
        for (let i = start; i < end; i++) {
          if (entries[i].id !== entry.id) {
            contextLogs.push(entries[i]);
          }
        }
      }
    }

    const input: SingleDiagnosisInput = {
      type: 'single',
      logEntry: entry,
      stackTrace: entry.stacktrace,
      contextLogs,
    };

    openDiagnosis(input, 'stacktrace');
  };

  return (
    <div
      id={`entry-${entry.id}`}
      className={`rounded-lg border transition-all log-viewer-font log-viewer-area ${borderStyle}`}
    >
      {/* 헤더 */}
      <div
        {...(hasStacktrace ? {
          role: "button",
          tabIndex: 0,
          "aria-expanded": isExpanded,
          "aria-label": isExpanded ? t('stackTrace.collapse') : t('stackTrace.expand'),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsExpanded((v) => !v);
            }
          },
        } : {})}
        className={`flex items-start gap-3 px-4 py-3 ${hasStacktrace ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]/60 focus-visible:rounded-md" : ""}`}
        onClick={() => hasStacktrace && setIsExpanded((v) => !v)}
      >
        {/* 레벨 뱃지 */}
        <span
          className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded log-viewer-font mt-0.5 ${badgeStyle}`}
        >
          {entry.level}
        </span>

        {/* 메인 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--color-text-tertiary)] log-viewer-font">{entry.timestamp}</span>
            <span className="text-xs text-[var(--color-text-disabled)] truncate max-w-[200px]" title={entry.logger}>
              {entry.logger}
            </span>
            {entry.thread && (
              <span className="text-xs text-[var(--color-text-disabled)] log-viewer-font">[{entry.thread}]</span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-primary)] break-words">{entry.message}</p>
          {entry.exceptionClass && !isExpanded && (
            <p className="mt-0.5 text-xs text-[var(--color-status-error-fg)] log-viewer-font truncate">
              {entry.exceptionClass}
              {entry.exceptionMessage && `: ${entry.exceptionMessage}`}
            </p>
          )}
        </div>

        {/* 접기/펼치기 버튼 + AI 진단 */}
        {hasStacktrace && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {userFrameCount > 0 && (
              <span className="text-[10px] text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)] bg-[var(--color-status-warn-bg)] dark:bg-[var(--color-status-warn-bg)] px-1.5 py-0.5 rounded">
                {userFrameCount} {t('stackTrace.userFrames')}
              </span>
            )}
            {/* AI 진단 버튼 */}
            {showAiButton && (
              <Tooltip content={tooltipContent} disabled={!tooltipContent}>
                <button
                  onClick={handleDiagnose}
                  disabled={isAiDisabled}
                  className="flex items-center gap-0.5 bg-[var(--color-accent-primary)] text-white font-medium border border-[var(--color-accent-primary)] rounded px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  aria-label={t('stackTrace.aiDiagnoseLabel', { exception: entry.exceptionClass ?? 'Error' })}
                >
                  <Sparkles className="w-3 h-3" />
                  {t('stackTrace.aiDiagnose')}
                </button>
              </Tooltip>
            )}
            <svg
              className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </div>

      {/* 스택트레이스 */}
      {isExpanded && hasStacktrace && (
        <div className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)] rounded-b-lg py-2 overflow-x-auto">
          {entry.exceptionClass && (
            <div className="px-4 py-1 log-viewer-font text-xs text-[var(--color-status-error-fg)]">
              {entry.exceptionClass}
              {entry.exceptionMessage && (
                <span className="text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]">: {entry.exceptionMessage}</span>
              )}
            </div>
          )}
          {entry.stacktrace.map((frame, i) => (
            <StackTraceLine key={i} frame={frame} />
          ))}
        </div>
      )}
    </div>
  );
}
