import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HorizonStat } from "../../api/types";
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
import { leadTimeLabel } from "./chartData";
import { TooltipCard } from "./ChartTooltip";

/** Mean absolute error by how far ahead the forecast was made (all forecast runs). */
export function LeadTimeChart({ horizons }: { horizons: HorizonStat[] }) {
  const rows = horizons.map((h) => ({ ...h, label: leadTimeLabel(h) }));
  const yAxis = gwAxis(rows.map((row) => row.mae_mw));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis {...axisProps} dataKey="label" interval={0} fontSize={11} />
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
            const row = hoveredRow<HorizonStat & { label: string }>(props);
            if (!row) return null;
            return (
              <TooltipCard
                title={`Published ${row.label} before delivery`}
                rows={[
                  {
                    label: "Mean absolute error",
                    value: formatGW(row.mae_mw),
                    color: "var(--series-forecast)",
                  },
                  { label: "Mean error (bias)", value: formatSignedGW(row.bias_mw) },
                ]}
                note={`${row.n.toLocaleString("en-GB")} forecast hours`}
              />
            );
          }}
        />
        <Line
          type="linear"
          dataKey="mae_mw"
          stroke="var(--series-forecast)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--series-forecast)", stroke: "var(--surface)", strokeWidth: 2 }}
          activeDot={activeDot}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
