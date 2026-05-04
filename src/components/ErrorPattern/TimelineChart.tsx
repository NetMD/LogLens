import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AUX_COLORS, CHART_LEVEL_COLORS } from "../../constants/chartColors";
import type { TimelinePoint } from "../../utils/errorAnalyzer";

interface Props {
  data: TimelinePoint[];
}

function formatHour(hour: string): string {
  // "2024-01-15 14:00" → "01/15 14시"
  try {
    const parts = hour.split(" ");
    const dateParts = parts[0].split("-");
    const timePart = parts[1]?.slice(0, 2) ?? "00";
    return `${dateParts[1]}/${dateParts[2]} ${timePart}시`;
  } catch {
    return hour;
  }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg p-3 text-xs shadow-lg">
      <p className="text-[var(--color-text-tertiary)] mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-[var(--color-text-secondary)]">{p.name}:</span>
          <span className="font-medium text-[var(--color-text-primary)]">{p.value.toLocaleString()}건</span>
        </div>
      ))}
    </div>
  );
};

export function TimelineChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--color-text-disabled)]">
        타임라인 데이터가 없습니다
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, hour: formatHour(d.hour) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} barSize={12} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-elevated)" vertical={false} />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          wrapperStyle={{ fontSize: "11px", color: CHART_AUX_COLORS.axisLabel }}
          iconType="circle"
          iconSize={6}
        />
        <Bar dataKey="ERROR" name="ERROR" stackId="a" fill={CHART_LEVEL_COLORS.ERROR} radius={[0, 0, 0, 0]} />
        <Bar dataKey="WARN" name="WARN" stackId="a" fill={CHART_LEVEL_COLORS.WARN} radius={[0, 0, 0, 0]} />
        <Bar dataKey="INFO" name="INFO" stackId="a" fill={CHART_LEVEL_COLORS.INFO} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
