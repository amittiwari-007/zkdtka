import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  formatDayTimeUK,
  formatGW,
  formatShortDayUK,
  formatSignedGW,
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
import type { MonthRow } from "./chartData";
import { TooltipCard } from "./ChartTooltip";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Forecast available at decision time vs actual, hour by hour across the whole period. */
export function MonthChart({ rows }: { rows: MonthRow[] }) {
  if (rows.length === 0) return null;
  const start = rows[0]!.t;
  const end = rows[rows.length - 1]!.t;
  const tickStep = end - start > 20 * DAY_MS ? 7 * DAY_MS : 2 * DAY_MS;
  const yAxis = gwAxis(rows.flatMap((row) => [row.forecast, row.actual]));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT + 70}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="t"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={ticksBetween(start, end, tickStep)}
          tickFormatter={formatShortDayUK}
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
            const row = hoveredRow<MonthRow>(props);
            if (!row) return null;
            return (
              <TooltipCard
                title={`${formatDayTimeUK(row.t)} (UK)`}
                rows={[
                  {
                    label: "Forecast at decision",
                    value: formatGW(row.forecast),
                    color: "var(--series-forecast)",
                  },
                  { label: "Actual", value: formatGW(row.actual), color: "var(--series-actual)" },
                  { label: "Error", value: formatSignedGW(row.forecast - row.actual) },
                ]}
              />
            );
          }}
        />
        <Line
          type="linear"
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
          dot={false}
          activeDot={activeDot}
          isAnimationActive={false}
        />
        <Brush
          dataKey="t"
          height={26}
          stroke="var(--axis-ink)"
          fill="var(--surface)"
          travellerWidth={8}
          tickFormatter={formatShortDayUK}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
