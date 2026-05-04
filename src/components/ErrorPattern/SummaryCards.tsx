import type { AnalysisResult } from "../../utils/errorAnalyzer";

interface Props {
  analysis: AnalysisResult;
}

const CARDS = [
  {
    level: "ERROR" as const,
    label: "에러",
    bg: "bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)]",
    border: "border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)]",
    text: "text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
    countText: "text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
  },
  {
    level: "WARN" as const,
    label: "경고",
    bg: "bg-[var(--color-status-warn-bg)] bg-[var(--color-status-warn-bg)]",
    border: "border-[var(--color-status-warn-border)] dark:border-[var(--color-status-warn-border)]",
    text: "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
    countText: "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
  },
  {
    level: "INFO" as const,
    label: "정보",
    bg: "bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)]/30",
    border: "border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)]",
    text: "text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
    countText: "text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
  },
  {
    level: "DEBUG" as const,
    label: "디버그",
    bg: "bg-[var(--color-bg-elevated)]",
    border: "border-[var(--color-border-default)]",
    text: "text-[var(--color-text-tertiary)]",
    countText: "text-[var(--color-text-tertiary)]",
  },
];

export function SummaryCards({ analysis }: Props) {
  const total = analysis.totalEntries;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* 전체 */}
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-4 py-3">
        <p className="text-xs text-[var(--color-text-tertiary)]">전체 로그</p>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
          {total.toLocaleString()}
        </p>
        {analysis.parseFailCount > 0 && (
          <p className="text-xs text-[var(--color-text-disabled)] mt-1">
            파싱 실패: {analysis.parseFailCount}건
          </p>
        )}
      </div>

      {CARDS.map(({ level, label, bg, border, text, countText }) => {
        const count = analysis.levelCounts[level] ?? 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
        return (
          <div key={level} className={`${bg} border ${border} rounded-lg px-4 py-3`}>
            <p className={`text-xs ${text}`}>{label}</p>
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
