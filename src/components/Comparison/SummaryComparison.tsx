// 요약 카드 비교 컴포넌트
// 레벨별 A/B 카운트 + 증감 뱃지 + 에러 비율 비교 행

import type { LevelDelta, DeltaType } from "../../utils/comparisonAnalyzer";
import { DeltaBadge } from "../shared/DeltaBadge";

interface SummaryComparisonProps {
  levelDeltas: LevelDelta[];
  errorRateA: number;
  errorRateB: number;
}

// 카드별 색상 매핑 (기존 SummaryCards CARDS 패턴과 유사)
const CARD_STYLES: Record<
  string,
  { bg: string; border: string; labelColor: string }
> = {
  전체: {
    bg: "bg-[var(--color-bg-elevated)]",
    border: "border-[var(--color-border-default)]",
    labelColor: "text-[var(--color-text-tertiary)]",
  },
  ERROR: {
    bg: "bg-[var(--color-status-error-bg)] dark:bg-[var(--color-status-error-bg)]",
    border: "border-[var(--color-status-error-border)] dark:border-[var(--color-status-error-border)]",
    labelColor: "text-[var(--color-status-error-fg)] dark:text-[var(--color-status-error-fg)]",
  },
  WARN: {
    bg: "bg-[var(--color-status-warn-bg)] bg-[var(--color-status-warn-bg)]",
    border: "border-[var(--color-status-warn-border)] dark:border-[var(--color-status-warn-border)]",
    labelColor: "text-[var(--color-status-warn-fg)] dark:text-[var(--color-status-warn-fg)]",
  },
  INFO: {
    bg: "bg-[var(--color-accent-primary-subtle-bg)] dark:bg-[var(--color-accent-primary-subtle-bg)]/30",
    border: "border-[var(--color-accent-primary)] dark:border-[var(--color-accent-primary)]",
    labelColor: "text-[var(--color-accent-primary)] dark:text-[var(--color-accent-primary)]",
  },
};

export function SummaryComparison({
  levelDeltas,
  errorRateA,
  errorRateB,
}: SummaryComparisonProps) {
  // 에러 비율 증감
  const errorRateDelta = Math.round((errorRateB - errorRateA) * 100) / 100;
  const errorRateDeltaType: DeltaType =
    errorRateDelta === 0 ? "none" : errorRateDelta > 0 ? "increase" : "decrease";

  return (
    <section>
      <h3
        id="comparison-summary"
        className="text-sm font-semibold text-[var(--color-text-primary)] mb-3"
      >
        요약 비교
      </h3>
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-labelledby="comparison-summary"
      >
        {levelDeltas.map((ld) => {
          const style = CARD_STYLES[ld.level] ?? CARD_STYLES["전체"];
          return (
            <div
              key={ld.level}
              className={`${style.bg} border ${style.border} rounded-lg px-4 py-3`}
            >
              <p className={`text-xs ${style.labelColor}`}>{ld.level}</p>
              {/* A 값 */}
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-[var(--color-accent-primary)]/60 text-xs">A:</span>
                <span className="text-lg font-bold text-[var(--color-text-primary)]">
                  {ld.countA.toLocaleString()}
                </span>
              </div>
              {/* B 값 */}
              <div className="flex items-baseline gap-1">
                <span className="text-[var(--color-status-success-fg)]/60 text-xs">B:</span>
                <span className="text-lg font-bold text-[var(--color-text-primary)]">
                  {ld.countB.toLocaleString()}
                </span>
              </div>
              {/* 증감 뱃지 */}
              <div className="mt-1">
                <DeltaBadge delta={ld.delta} deltaType={ld.deltaType} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 에러 비율 행 */}
      <div className="mt-3 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            에러 비율 (ERROR/전체)
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm">
              <span className="text-[var(--color-accent-primary)]/60">A:</span>{" "}
              {errorRateA.toFixed(2)}%
            </span>
            <span className="text-sm">
              <span className="text-[var(--color-status-success-fg)]/60">B:</span>{" "}
              {errorRateB.toFixed(2)}%
            </span>
            <DeltaBadge
              delta={errorRateDelta}
              deltaType={errorRateDeltaType}
              isPercentage
            />
          </div>
        </div>
      </div>
    </section>
  );
}
