// 시간대별 ERROR 비교 차트
// 절대 시간 / 상대 시간 토글 모드 지원

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COMPARE_COLORS } from "../../constants/chartColors";
import type { TimelinePoint } from "../../utils/errorAnalyzer";

type TimeMode = "absolute" | "relative";

interface ChartComparisonProps {
  timelineA: TimelinePoint[];
  timelineB: TimelinePoint[];
  fileNameA: string;
  fileNameB: string;
}

// --- 절대 시간 데이터 생성 ---
// A/B의 모든 시간대 합집합으로 X축 구성, 없는 시간대는 0
function buildAbsoluteData(
  timelineA: TimelinePoint[],
  timelineB: TimelinePoint[]
): { hour: string; errorA: number; errorB: number }[] {
  const mapA = new Map<string, number>();
  for (const p of timelineA) mapA.set(p.hour, p.ERROR);

  const mapB = new Map<string, number>();
  for (const p of timelineB) mapB.set(p.hour, p.ERROR);

  // 합집합 시간대 수집 + 정렬
  const allHours = new Set<string>();
  for (const h of mapA.keys()) allHours.add(h);
  for (const h of mapB.keys()) allHours.add(h);

  return Array.from(allHours)
    .sort()
    .map((hour) => ({
      hour,
      errorA: mapA.get(hour) ?? 0,
      errorB: mapB.get(hour) ?? 0,
    }));
}

// --- 상대 시간 데이터 생성 ---
// 각 파일의 첫 로그 시간을 0h로 정규화
function buildRelativeData(
  timelineA: TimelinePoint[],
  timelineB: TimelinePoint[]
): { offset: number; label: string; errorA: number; errorB: number }[] {
  if (timelineA.length === 0 && timelineB.length === 0) return [];

  const toHourOffset = (timeline: TimelinePoint[]) => {
    if (timeline.length === 0) return new Map<number, number>();
    const baseHour = parseHour(timeline[0].hour);
    const map = new Map<number, number>();
    for (const p of timeline) {
      const offset = parseHour(p.hour) - baseHour;
      map.set(offset, p.ERROR);
    }
    return map;
  };

  const mapA = toHourOffset(timelineA);
  const mapB = toHourOffset(timelineB);

  const maxOffset = Math.max(
    mapA.size > 0 ? Math.max(...mapA.keys()) : 0,
    mapB.size > 0 ? Math.max(...mapB.keys()) : 0
  );

  const result: { offset: number; label: string; errorA: number; errorB: number }[] = [];
  for (let i = 0; i <= maxOffset; i++) {
    result.push({
      offset: i,
      label: `+${i}h`,
      errorA: mapA.get(i) ?? 0,
      errorB: mapB.get(i) ?? 0,
    });
  }
  return result;
}

// "2026-04-09 09:00" → epoch hour 단위 숫자
function parseHour(hour: string): number {
  try {
    const [datePart, timePart] = hour.split(" ");
    const [y, m, d] = datePart.split("-").map(Number);
    const h = parseInt(timePart?.slice(0, 2) ?? "0", 10);
    return new Date(y, m - 1, d, h).getTime() / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

// "2026-04-09 09:00" → "04-09 09시"
function formatAbsoluteLabel(hour: string): string {
  try {
    const [datePart, timePart] = hour.split(" ");
    const parts = datePart.split("-");
    const h = timePart?.slice(0, 2) ?? "00";
    return `${parts[1]}-${parts[2]} ${h}시`;
  } catch {
    return hour;
  }
}

// 첫 로그 시간 포맷: "2026-04-09 09:12" → "2026-04-09 09시"
function formatStartTime(timeline: TimelinePoint[]): string {
  if (timeline.length === 0) return "-";
  return formatAbsoluteLabel(timeline[0].hour).replace("-", "/");
}

// --- 커스텀 툴팁 ---
function ChartTooltip({ active, payload, label, fileNameA, fileNameB }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-3 text-xs shadow-lg">
      <p className="text-[var(--color-text-tertiary)] mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: p.stroke }}
          />
          <span className="text-[var(--color-text-secondary)]">
            {p.dataKey === "errorA" ? fileNameA : fileNameB}:
          </span>
          <span className="font-medium text-[var(--color-text-primary)]">
            {p.value.toLocaleString()}건
          </span>
        </div>
      ))}
    </div>
  );
}

// --- 메인 컴포넌트 ---

export function ChartComparison({
  timelineA,
  timelineB,
  fileNameA,
  fileNameB,
}: ChartComparisonProps) {
  const [timeMode, setTimeMode] = useState<TimeMode>("absolute");

  const absoluteData = useMemo(
    () => buildAbsoluteData(timelineA, timelineB),
    [timelineA, timelineB]
  );

  const relativeData = useMemo(
    () => buildRelativeData(timelineA, timelineB),
    [timelineA, timelineB]
  );

  const isEmpty = timelineA.length === 0 && timelineB.length === 0;

  if (isEmpty) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
          시간대별 ERROR 비교
        </h3>
        <div className="border border-dashed border-[var(--color-border-default)] rounded-lg text-center py-10">
          <p className="text-sm text-[var(--color-text-disabled)]">
            ERROR 로그가 없어 차트를 표시할 수 없습니다
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* 헤더 + 토글 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          시간대별 ERROR 비교
        </h3>
        <div className="flex rounded-md border border-[var(--color-border-default)] overflow-hidden">
          <button
            className={`px-3 py-1 text-xs transition-colors ${
              timeMode === "absolute"
                ? "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            }`}
            onClick={() => setTimeMode("absolute")}
          >
            절대 시간
          </button>
          <button
            className={`px-3 py-1 text-xs border-l border-[var(--color-border-default)] transition-colors ${
              timeMode === "relative"
                ? "bg-[var(--color-button-primary-bg)]/20 text-[var(--color-accent-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            }`}
            onClick={() => setTimeMode("relative")}
          >
            상대 시간
          </button>
        </div>
      </div>

      {/* 차트 */}
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4">
        <ResponsiveContainer width="100%" height={280}>
          {timeMode === "absolute" ? (
            <LineChart data={absoluteData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border-default)"
                opacity={0.5}
              />
              <XAxis
                dataKey="hour"
                tickFormatter={formatAbsoluteLabel}
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                angle={-45}
                textAnchor="end"
                height={50}
                stroke="var(--color-border-default)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                stroke="var(--color-border-default)"
                allowDecimals={false}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    fileNameA={fileNameA}
                    fileNameB={fileNameB}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="errorA"
                name={fileNameA}
                stroke={CHART_COMPARE_COLORS.A}
                strokeWidth={2}
                dot={(props: any) =>
                  props.payload.errorA > 0 ? (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={CHART_COMPARE_COLORS.A}
                      stroke="none"
                    />
                  ) : (
                    <></>
                  )
                }
                activeDot={{ r: 4, fill: CHART_COMPARE_COLORS.A }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="errorB"
                name={fileNameB}
                stroke={CHART_COMPARE_COLORS.B}
                strokeWidth={2}
                dot={(props: any) =>
                  props.payload.errorB > 0 ? (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={CHART_COMPARE_COLORS.B}
                      stroke="none"
                    />
                  ) : (
                    <></>
                  )
                }
                activeDot={{ r: 4, fill: CHART_COMPARE_COLORS.B }}
                connectNulls
              />
            </LineChart>
          ) : (
            <LineChart data={relativeData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border-default)"
                opacity={0.5}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                stroke="var(--color-border-default)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                stroke="var(--color-border-default)"
                allowDecimals={false}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    fileNameA={fileNameA}
                    fileNameB={fileNameB}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="errorA"
                name={fileNameA}
                stroke={CHART_COMPARE_COLORS.A}
                strokeWidth={2}
                dot={(props: any) =>
                  props.payload.errorA > 0 ? (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={CHART_COMPARE_COLORS.A}
                      stroke="none"
                    />
                  ) : (
                    <></>
                  )
                }
                activeDot={{ r: 4, fill: CHART_COMPARE_COLORS.A }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="errorB"
                name={fileNameB}
                stroke={CHART_COMPARE_COLORS.B}
                strokeWidth={2}
                dot={(props: any) =>
                  props.payload.errorB > 0 ? (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={CHART_COMPARE_COLORS.B}
                      stroke="none"
                    />
                  ) : (
                    <></>
                  )
                }
                activeDot={{ r: 4, fill: CHART_COMPARE_COLORS.B }}
                connectNulls
              />
            </LineChart>
          )}
        </ResponsiveContainer>

        {/* 범례 */}
        <div className="flex items-center justify-center gap-6 mt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent-primary)]" />
            <span className="text-[var(--color-text-secondary)]">
              {fileNameA}
              {timeMode === "relative" && (
                <span className="text-[var(--color-text-disabled)] ml-1">
                  ({formatStartTime(timelineA)} 시작)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-status-success-fg)]" />
            <span className="text-[var(--color-text-secondary)]">
              {fileNameB}
              {timeMode === "relative" && (
                <span className="text-[var(--color-text-disabled)] ml-1">
                  ({formatStartTime(timelineB)} 시작)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
