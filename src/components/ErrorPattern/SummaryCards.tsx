import { useTranslation } from "react-i18next";
import type { AnalysisResult } from "../../utils/errorAnalyzer";

interface Props {
  analysis: AnalysisResult;
}

// label 은 i18n 키 문자열 — 렌더 시점에 t() 적용
const CARDS = [
  {
    level: "ERROR" as const,
    labelKey: "errorPattern.errors",
    bg: "bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)]",
    border: "border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)]",
    text: "text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
    countText: "text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
  },
  {
    level: "WARN" as const,
    labelKey: "errorPattern.warnings",
    bg: "bg-[var(--color-status-warn-bg)] bg-[var(--color-status-warn-bg)]",
    border: "border-[var(--color-status-warn-border)] dark:border-[var(--color-status-warn-border)]",
    text: "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
    countText: "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
  },
  {
    level: "INFO" as const,
    labelKey: "errorPattern.info",
    bg: "bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)]/30",
    border: "border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)]",
    text: "text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
    countText: "text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
  },
  {
    level: "DEBUG" as const,
    labelKey: "errorPattern.debug",
    bg: "bg-[var(--color-bg-elevated)]",
    border: "border-[var(--color-border-default)]",
    text: "text-[var(--color-text-tertiary)]",
    countText: "text-[var(--color-text-tertiary)]",
  },
];

export function SummaryCards({ analysis }: Props) {
  const { t } = useTranslation();
  const total = analysis.totalEntries;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* 전체 */}
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-4 py-3">
        <p className="text-xs text-[var(--color-text-tertiary)]">{t('errorPattern.totalLogs')}</p>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
          {total.toLocaleString()}
        </p>
        {analysis.parseFailCount > 0 && (
          <p className="text-xs text-[var(--color-text-disabled)] mt-1">
            {t('errorPattern.parseFail', { count: analysis.parseFailCount })}
          </p>
        )}
      </div>

      {CARDS.map(({ level, labelKey, bg, border, text, countText }) => {
        const count = analysis.levelCounts[level] ?? 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
        return (
          <div key={level} className={`${bg} border ${border} rounded-lg px-4 py-3`}>
            <p className={`text-xs ${text}`}>{t(labelKey)}</p>
            <p className={`text-2xl font-bold ${countText} mt-1`}>
              {count.toLocaleString()}
            </p>
            <p className="text-xs text-[var(--color-text-disabled)] mt-1">{pct}%</p>
          </div>
        );
      })}
    </div>
  );
}
