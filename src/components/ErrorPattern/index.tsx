import { useLogStore } from "../../store/logStore";
import { SummaryCards } from "./SummaryCards";
import { TimelineChart } from "./TimelineChart";
import { TopErrorList } from "./TopErrorList";

export function ErrorPatternView() {
  // selector 분리 — store 의 다른 필드(progress, entries 등) 변경으로 인한 리렌더 차단
  const analysis = useLogStore((s) => s.analysis);

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-disabled)]">
        분석 결과가 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto h-full">
      <SummaryCards analysis={analysis} />

      {/* 시간대별 분포 */}
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-tertiary)] mb-3">시간대별 로그 분포</h3>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-4">
          <TimelineChart data={analysis.timeline} />
        </div>
      </section>

      {/* Top N 에러 (스택트레이스 포함된 예외 유형 기준) */}
      <section>
        <h3 className="text-sm font-medium text-[var(--color-text-tertiary)] mb-3">
          Top {analysis.topErrors.length} 에러
          <span className="ml-2 text-xs text-[var(--color-text-disabled)] font-normal">
            스택트레이스가 포함된 에러 유형 · 클릭하면 해당 스택트레이스로 이동
          </span>
        </h3>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-3">
          <TopErrorList analysis={analysis} />
        </div>
      </section>
    </div>
  );
}
