import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ForecastLevelStat } from "../../api/types";
import { formatGW, formatSignedGW, gwTick } from "../../lib/format";
import {
  axisProps,
  CHART_HEIGHT,
  cursorBand,
  gridProps,
  gwAxis,
  hoveredRow,
  roundedBar,
} from "./chartUtils";
import { levelLabel } from "./chartData";
import { TooltipCard } from "./ChartTooltip";

const fillBySign = roundedBar<ForecastLevelStat>(
  (level) => ((level.bias_mw ?? 0) >= 0 ? "var(--diverging-over)" : "var(--diverging-under)"),
  (level) => (level.bias_mw ?? 0) < 0,
);

/** Mean error grouped by how much wind was forecast. */
export function ForecastLevelChart({ levels }: { levels: ForecastLevelStat[] }) {
  const rows = levels.map((level) => ({ ...level, label: levelLabel(level) }));
  const yAxis = gwAxis(rows.map((row) => row.bias_mw));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid {...gridProps} />
        <XAxis {...axisProps} dataKey="label" interval={0} fontSize={11} />
        <YAxis
          {...axisProps}
          width={44}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          tickFormatter={gwTick}
        />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          cursor={cursorBand}
          content={(props) => {
            const row = hoveredRow<ForecastLevelStat & { label: string }>(props);
            if (!row) return null;
            return (
              <TooltipCard
                title={`Forecast ${row.label} GW`}
                rows={[
                  {
                    label: "Mean error (bias)",
                    value: formatSignedGW(row.bias_mw),
                    color:
                      (row.bias_mw ?? 0) >= 0 ? "var(--diverging-over)" : "var(--diverging-under)",
                    kind: "bar",
                  },
                  { label: "Mean absolute error", value: formatGW(row.mae_mw) },
                ]}
                note={`${row.n} hours`}
              />
            );
          }}
        />
        <Bar dataKey="bias_mw" maxBarSize={24} shape={fillBySign} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
