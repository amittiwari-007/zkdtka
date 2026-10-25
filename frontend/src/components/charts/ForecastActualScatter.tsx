import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ScatterPoint } from "../../api/types";
import { formatDayTimeUK, formatGW, formatSignedGW, gwTick } from "../../lib/format";
import { axisProps, CHART_HEIGHT, gwAxis, hoveredRow } from "./chartUtils";
import { TooltipCard } from "./ChartTooltip";

/** Each hour as a dot: forecast (x) vs actual (y). Dots below the diagonal = forecast too high. */
export function ForecastActualScatter({ points }: { points: ScatterPoint[] }) {
  const axis = gwAxis(points.flatMap((p) => [p.forecast_mw, p.actual_mw]));
  const limit = axis.domain[1];
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT + 20}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis
          {...axisProps}
          dataKey="forecast_mw"
          type="number"
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={gwTick}
          name="Forecast"
        />
        <YAxis
          {...axisProps}
          dataKey="actual_mw"
          type="number"
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={gwTick}
          width={44}
          name="Actual"
        />
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: limit, y: limit },
          ]}
          stroke="var(--axis-ink)"
          strokeWidth={1}
          ifOverflow="hidden"
        />
        <Tooltip
          cursor={false}
          content={(props) => {
            const point = hoveredRow<ScatterPoint>(props);
            if (!point) return null;
            return (
              <TooltipCard
                title={`${formatDayTimeUK(point.start_time)} (UK)`}
                rows={[
                  { label: "Forecast", value: formatGW(point.forecast_mw) },
                  { label: "Actual", value: formatGW(point.actual_mw) },
                  { label: "Error", value: formatSignedGW(point.forecast_mw - point.actual_mw) },
                ]}
              />
            );
          }}
        />
        <Scatter
          data={points}
          fill="var(--series-forecast)"
          fillOpacity={0.4}
          isAnimationActive={false}
          shape="circle"
          legendType="circle"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
