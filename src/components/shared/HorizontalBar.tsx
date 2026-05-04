// 수평 바 공통 컴포넌트
// ExceptionComparison에서 A/B 건수 비례 바 렌더링에 사용

interface HorizontalBarProps {
  count: number;
  maxCount: number;
  color: "blue" | "emerald";
}

export function HorizontalBar({ count, maxCount, color }: HorizontalBarProps) {
  // 0건이면 바 미표시
  if (count === 0) return null;

  const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const bgClass = color === "blue" ? "bg-[var(--color-button-primary-bg)]/70" : "bg-[var(--color-status-success-fg)]";

  return (
    <div className="h-1.5 bg-[var(--color-border-default)] rounded-full overflow-hidden">
      <div
        className={`h-full ${bgClass} rounded-full transition-all`}
        style={{ width: `${widthPct}%`, minWidth: "4px" }}
      />
    </div>
  );
}
