import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DecisionTimeStat } from "../../api/types";
import { formatGW, formatHours, formatSignedGW, gwTick } from "../../lib/format";
import {
  axisProps,
  CHART_HEIGHT,
  cursorBand,
  gridProps,
  gwAxis,
  hoveredRow,
  roundedBar,
} from "./chartUtils";
import { TooltipCard } from "./ChartTooltip";

interface DecisionTimeChartProps {
  rows: DecisionTimeStat[];
  selected: string;
}

/** "Value of waiting": accuracy if the purchase were decided at other times on D-1. */
export function DecisionTimeChart({ rows, selected }: DecisionTimeChartProps) {
  // Emphasis: the selected decision time in the accent colour, the alternatives in grey.
  const shape = roundedBar<DecisionTimeStat>((row) =>
    row.decision_time === selected ? "var(--series-forecast)" : "var(--context)",
  );
  const yAxis = gwAxis(rows.map((row) => row.mae_mw));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid {...gridProps} />
        <XAxis {...axisProps} dataKey="decision_time" interval={0} fontSize={11} />
        <YAxis
          {...axisProps}
          width={44}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          tickFormatter={gwTick}
        />
        <Tooltip
          cursor={cursorBand}
          content={(props) => {
            const row = hoveredRow<DecisionTimeStat>(props);
            if (!row) return null;
            return (
              <TooltipCard
                title={`Decide at ${row.decision_time} on the day before${row.label ? ` · ${row.label}` : ""}`}
                rows={[
                  {
                    label: "Mean absolute error",
                    value: formatGW(row.mae_mw),
                    color:
                      row.decision_time === selected ? "var(--series-forecast)" : "var(--context)",
                    kind: "bar",
                  },
                  { label: "Mean error (bias)", value: formatSignedGW(row.bias_mw) },
                  { label: "90% of hours within", value: formatGW(row.p90_abs_error_mw) },
                ]}
                note={`Typical lead time ${formatHours(row.median_horizon_h)}`}
              />
            );
          }}
        />
        <Bar dataKey="mae_mw" maxBarSize={24} shape={shape} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
