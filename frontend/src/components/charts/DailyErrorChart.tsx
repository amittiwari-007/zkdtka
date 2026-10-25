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

import type { DailyStat } from "../../api/types";
import { formatDateShort, formatGW, formatGWh, formatSignedGW, gwTick } from "../../lib/format";
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

const fillBySign = roundedBar<DailyStat>(
  (day) => ((day.bias_mw ?? 0) >= 0 ? "var(--diverging-over)" : "var(--diverging-under)"),
  (day) => (day.bias_mw ?? 0) < 0,
);

interface DailyErrorChartProps {
  days: DailyStat[];
  onSelectDay?: (deliveryDate: string) => void;
}

/** Mean error per delivery day; positive = forecast too high. Click a bar to open that day. */
export function DailyErrorChart({ days, onSelectDay }: DailyErrorChartProps) {
  const yAxis = gwAxis(days.map((day) => day.bias_mw));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="delivery_date"
          tickFormatter={(value: string) => formatDateShort(value).replace(/^\w+ /, "")}
          minTickGap={16}
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
          cursor={cursorBand}
          content={(props) => {
            const day = hoveredRow<DailyStat>(props);
            if (!day) return null;
            return (
              <TooltipCard
                title={`Delivery ${formatDateShort(day.delivery_date)}`}
                rows={[
                  {
                    label: "Mean error (bias)",
                    value: formatSignedGW(day.bias_mw),
                    color:
                      (day.bias_mw ?? 0) >= 0 ? "var(--diverging-over)" : "var(--diverging-under)",
                    kind: "bar",
                  },
                  { label: "Mean absolute error", value: formatGW(day.mae_mw) },
                  { label: "Worst hour", value: formatGW(day.max_abs_error_mw) },
                  {
                    label: "Forecast vs actual energy",
                    value: `${formatGWh(day.forecast_energy_mwh)} vs ${formatGWh(day.actual_energy_mwh)}`,
                  },
                ]}
                note={onSelectDay ? "Click to open this day" : undefined}
              />
            );
          }}
        />
        <Bar
          dataKey="bias_mw"
          maxBarSize={20}
          shape={fillBySign}
          isAnimationActive={false}
          cursor={onSelectDay ? "pointer" : undefined}
          onClick={(entry: { payload?: DailyStat }) => {
            if (entry.payload && onSelectDay) onSelectDay(entry.payload.delivery_date);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
