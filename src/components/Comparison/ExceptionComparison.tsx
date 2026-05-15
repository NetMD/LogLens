// 예외 비교 컴포넌트
// CSS 바 차트 + A만/B만/공통 시각 구분 (NEW/RESOLVED 뱃지)

import { useTranslation } from "react-i18next";
import type { ExceptionDelta, DeltaType } from "../../utils/comparisonAnalyzer";
import { DeltaBadge } from "../shared/DeltaBadge";
import { HorizontalBar } from "../shared/HorizontalBar";

interface ExceptionComparisonProps {
  exceptionDeltas: ExceptionDelta[];
}

export function ExceptionComparison({
  exceptionDeltas,
}: ExceptionComparisonProps) {
  const { t } = useTranslation();
  // 빈 상태
  if (exceptionDeltas.length === 0) {
    return (
      <section>
        <h3
          id="comparison-exception"
          className="text-sm font-semibold text-[var(--color-text-primary)] mb-3"
        >
          {t('comparison.exceptionComparison')}
        </h3>
        <div className="text-sm text-[var(--color-text-disabled)] py-6 text-center">
          {t('comparison.noExceptions')}
        </div>
      </section>
    );
  }

  // maxCount: 모든 행의 A/B 건수 중 최대값 (바 너비 기준)
  const maxCount = Math.max(
    ...exceptionDeltas.flatMap((d) => [d.countA, d.countB])
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3
          id="comparison-exception"
          className="text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('comparison.exceptionComparison')}
        </h3>
        <span className="text-xs text-[var(--color-text-disabled)]">
          {t('comparison.sortByB')}
        </span>
      </div>

      <div
        className="space-y-2"
        role="list"
        aria-labelledby="comparison-exception"
      >
        {exceptionDeltas.map((d, i) => {
          // 공통 예외의 deltaType 결정
          const deltaType: DeltaType =
            d.presence !== "both"
              ? "none"
              : d.delta === 0
                ? "none"
                : d.delta > 0
                  ? "increase"
                  : "decrease";

          return (
            <div
              key={d.exceptionClass}
              role="listitem"
              className="bg-[var(--color-bg-elevated)] rounded-lg px-4 py-3
                         hover:bg-[var(--color-bg-hover)] cursor-pointer"
              title={t('comparison.detailComingSoon')}
            >
              {/* 헤더: 순위 + 클래스명 + 뱃지 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-[var(--color-text-disabled)] w-5 text-right">
                  {i + 1}
                </span>
                <span
                  className="text-sm font-mono text-[var(--color-text-primary)] truncate"
                  title={d.exceptionClass}
                >
                  {d.exceptionClass.split(".").pop()}
                </span>

                {/* presence 뱃지: onlyB -> NEW, onlyA -> RESOLVED */}
                {d.presence === "onlyB" && (
                  <span className="bg-[var(--color-status-warn-bg)] text-[var(--color-status-warn-fg)] rounded px-1.5 py-0.5 text-[10px] font-medium">
                    NEW
                    <span className="sr-only">{t('comparison.newException')}</span>
                  </span>
                )}
                {d.presence === "onlyA" && (
                  <span className="bg-[var(--color-status-success-fg)]/20 text-[var(--color-status-success-fg)] rounded px-1.5 py-0.5 text-[10px] font-medium">
                    RESOLVED
                    <span className="sr-only">{t('comparison.resolvedException')}</span>
                  </span>
                )}

                {/* 공통 예외의 증감 뱃지 */}
                {d.presence === "both" && (
                  <DeltaBadge delta={d.delta} deltaType={deltaType} />
                )}
              </div>

              {/* A 바 */}
              <div className="flex items-center gap-2 ml-7">
                <span className="text-[var(--color-accent-primary)]/60 text-xs w-3">A:</span>
                {d.countA > 0 ? (
                  <>
                    <div className="flex-1">
                      <HorizontalBar
                        count={d.countA}
                        maxCount={maxCount}
                        color="blue"
                      />
                    </div>
                    <span className="text-xs text-[var(--color-text-tertiary)] font-medium w-12 text-right">
                      {t('errorPattern.countItems', { count: d.countA.toLocaleString() })}
                    </span>
                  </>
                ) : (
                  <span
                    className="text-xs text-[var(--color-text-disabled)] italic"
                    aria-label={t('comparison.noCountAria')}
                  >
                    {t('comparison.noCount')}
                  </span>
                )}
              </div>

              {/* B 바 */}
              <div className="flex items-center gap-2 ml-7 mt-1">
                <span className="text-[var(--color-status-success-fg)]/60 text-xs w-3">B:</span>
                {d.countB > 0 ? (
                  <>
                    <div className="flex-1">
                      <HorizontalBar
                        count={d.countB}
                        maxCount={maxCount}
                        color="emerald"
                      />
                    </div>
                    <span className="text-xs text-[var(--color-text-tertiary)] font-medium w-12 text-right">
                      {t('errorPattern.countItems', { count: d.countB.toLocaleString() })}
                    </span>
                  </>
                ) : (
                  <span
                    className="text-xs text-[var(--color-text-disabled)] italic"
                    aria-label={t('comparison.noCountAria')}
                  >
                    {t('comparison.noCount')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
