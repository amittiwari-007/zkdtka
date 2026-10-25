import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DayView } from "../../api/types";
import {
  formatDayTimeUK,
  formatGW,
  formatHours,
  formatSignedGW,
  formatTimeUK,
  gwTick,
} from "../../lib/format";
import {
  activeDot,
  axisProps,
  CHART_HEIGHT,
  cursorLine,
  gridProps,
  gwAxis,
  hoveredRow,
  ticksBetween,
} from "./chartUtils";
import { buildDayRows, HALF_HOUR_MS, HOUR_MS, type DayRow } from "./chartData";
import { TooltipCard, type TooltipRow } from "./ChartTooltip";

interface DayChartProps {
  view: DayView;
  showRuns: boolean;
}

export function DayChart({ view, showRuns }: DayChartProps) {
  const rows = buildDayRows(view);
  if (rows.length === 0) return null;
  const start = rows[0]!.t;
  const end = rows[rows.length - 1]!.t;
  const contextRuns = showRuns ? view.runs.filter((run) => !run.used) : [];
  const bandPct = Math.round(view.band_confidence * 100);
  const yAxis = gwAxis(
    rows.flatMap((row) => [
      row.actual,
      row.forecast,
      row.band?.[1],
      ...contextRuns.map((run) => row.runs[run.publish_time]),
    ]),
  );

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT + 40}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="t"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={ticksBetween(start, end, 3 * HOUR_MS)}
          tickFormatter={formatTimeUK}
        />
        <YAxis
          {...axisProps}
          width={44}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          tickFormatter={gwTick}
        />
        <Tooltip
          cursor={cursorLine}
          content={(props) => {
            const row = hoveredRow<DayRow>(props);
            if (!row) return null;
            const items: TooltipRow[] = [
              {
                label: "Forecast at decision",
                value: formatGW(row.forecast),
                color: "var(--series-forecast)",
              },
              {
                label: `Likely range (${bandPct}%)`,
                value: row.band ? `${formatGW(row.band[0], 1)}–${formatGW(row.band[1], 1)}` : "—",
                color: "var(--band)",
                kind: "area",
              },
              { label: "Actual", value: formatGW(row.actual), color: "var(--series-actual)" },
              { label: "Hourly error", value: formatSignedGW(row.hourError) },
            ];
            return (
              <TooltipCard
                title={`${formatTimeUK(row.t)}–${formatTimeUK(row.t + HALF_HOUR_MS)} (UK)`}
                rows={items}
                note={
                  row.publishTime
                    ? `Run published ${formatDayTimeUK(row.publishTime)} · ${formatHours(row.horizonH)} ahead`
                    : "No forecast was available at the deadline"
                }
              />
            );
          }}
        />
        <Area
          type="stepAfter"
          dataKey="band"
          stroke="none"
          fill="var(--band)"
          fillOpacity={1}
          activeDot={false}
          isAnimationActive={false}
        />
        {contextRuns.map((run) => (
          <Line
            key={run.publish_time}
            type="stepAfter"
            dataKey={(row: DayRow) => row.runs[run.publish_time]}
            stroke="var(--context)"
            strokeOpacity={run.available_at_decision ? 0.6 : 0.45}
            strokeWidth={1.25}
            strokeDasharray={run.available_at_decision ? undefined : "4 3"}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <Line
          type="stepAfter"
          dataKey="forecast"
          stroke="var(--series-forecast)"
          strokeWidth={2}
          dot={false}
          activeDot={activeDot}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="actual"
          stroke="var(--series-actual)"
          strokeWidth={2}
          strokeLinejoin="round"
          dot={false}
          activeDot={activeDot}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
