import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HourOfDayStat } from "../../api/types";
import { formatGW, formatSignedGW, gwTick } from "../../lib/format";
import {
  activeDot,
  axisProps,
  CHART_HEIGHT,
  cursorLine,
  gridProps,
  gwAxis,
  hoveredRow,
} from "./chartUtils";
import { TooltipCard } from "./ChartTooltip";

interface HourRow {
  hour: number;
  bias: number | null;
  band: [number, number] | null;
  mae: number | null;
  n: number;
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Mean error and the central 80% of errors for each hour of the delivery day. */
export function HourOfDayChart({ hours }: { hours: HourOfDayStat[] }) {
  const rows: HourRow[] = hours.map((h) => ({
    hour: h.hour,
    bias: h.bias_mw,
    band:
      h.p10_error_mw != null && h.p90_error_mw != null ? [h.p10_error_mw, h.p90_error_mw] : null,
    mae: h.mae_mw,
    n: h.n,
  }));
  const yAxis = gwAxis(rows.flatMap((row) => [row.bias, ...(row.band ?? [])]));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="hour"
          type="number"
          domain={[0, 23]}
          ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
          tickFormatter={hourLabel}
        />
        <YAxis
          {...axisProps}
          width={44}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          tickFormatter={gwTick}
        />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          cursor={cursorLine}
          content={(props) => {
            const row = hoveredRow<HourRow>(props);
            if (!row) return null;
            return (
              <TooltipCard
                title={`${hourLabel(row.hour)}–${hourLabel((row.hour + 1) % 24)} (UK)`}
                rows={[
                  {
                    label: "Mean error (bias)",
                    value: formatSignedGW(row.bias),
                    color: "var(--series-forecast)",
                  },
                  {
                    label: "Middle 80% of errors",
                    value: row.band
                      ? `${formatSignedGW(row.band[0], 1)} to ${formatSignedGW(row.band[1], 1)}`
                      : "—",
                    color: "var(--band)",
                    kind: "area",
                  },
                  { label: "Mean absolute error", value: formatGW(row.mae) },
                ]}
                note={`${row.n} hours`}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="var(--band)"
          fillOpacity={1}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="bias"
          stroke="var(--series-forecast)"
          strokeWidth={2}
          dot={false}
          activeDot={activeDot}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
