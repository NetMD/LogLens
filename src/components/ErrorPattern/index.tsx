import { useTranslation } from "react-i18next";
import { useActiveFileAnalysis } from "../../store/activeFileSelectors";
import { SummaryCards } from "./SummaryCards";
import { TimelineChart } from "./TimelineChart";
import { TopErrorList } from "./TopErrorList";

export function ErrorPatternView() {
  // [큐레이터 제약 P0] t() 호출은 컴포넌트 최상단에서만. useMemo deps 에는 t 자체도 포함 금지.
  // (현재 본 컴포넌트는 useMemo 가 없지만, 회귀 방지 주석을 명시한다.)
  const { t } = useTranslation();
  // selector 분리 — store 의 다른 필드(progress, entries 등) 변경으로 인한 리렌더 차단
  const analysis = useActiveFileAnalysis();

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-disabled)]">
        {t('errorPattern.noAnalysis')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto h-full">
      <SummaryCards analysis={analysis} />

      {/* 시간대별 분포 */}
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-tertiary)] mb-3">
          {t('errorPattern.hourlyDistribution')}
        </h3>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4">
          <TimelineChart data={analysis.timeline} />
        </div>
      </section>

      {/* Top N 에러 (스택트레이스 포함된 예외 유형 기준) */}
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-tertiary)] mb-3">
          {t('errorPattern.topErrorsHeader', { count: analysis.topErrors.length })}
          <span className="ml-2 text-xs text-[var(--color-text-disabled)] font-normal">
            {t('errorPattern.topErrorsDesc')}
          </span>
        </h3>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-3">
          <TopErrorList analysis={analysis} />
        </div>
      </section>
    </div>
  );
}
