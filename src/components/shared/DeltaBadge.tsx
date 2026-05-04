// 증감 수치 + 화살표 + 색상 뱃지 공통 컴포넌트
// SummaryComparison, ExceptionComparison에서 사용

import type { DeltaType } from "../../utils/comparisonAnalyzer";

interface DeltaBadgeProps {
  delta: number;
  deltaType: DeltaType;
  isPercentage?: boolean; // true이면 "%p" 접미사
}

export function DeltaBadge({
  delta,
  deltaType,
  isPercentage = false,
}: DeltaBadgeProps) {
  // deltaType === "none"이면 렌더링 안 함
  if (deltaType === "none") return null;

  // 화살표 결정
  const arrow =
    deltaType === "increase"
      ? "\u25B2" // 채워진 위 화살표
      : deltaType === "decrease"
        ? "\u25BC" // 채워진 아래 화살표
        : delta > 0
          ? "\u25B3" // 빈 위 화살표 (neutral)
          : "\u25BD"; // 빈 아래 화살표 (neutral)

  // 부호 결정 (음수는 자동으로 "-")
  const sign = delta > 0 ? "+" : "";

  // 값 포맷
  const formatted = isPercentage
    ? `${sign}${Math.abs(delta).toFixed(2)}%p`
    : `${sign}${delta.toLocaleString()}`;

  // 색상 결정
  const colorClass =
    deltaType === "increase"
      ? "bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)] text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]"
      : deltaType === "decrease"
        ? "bg-[var(--color-status-success-bg)] dark:bg-[var(--color-status-success-bg)] text-[var(--color-status-success-fg)] dark:text-[var(--color-status-success-fg)]"
        : "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)]";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {arrow} {formatted}
    </span>
  );
}
