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

import type { HistogramBin } from "../../api/types";
import { formatPercent, formatSignedGW, gwTick } from "../../lib/format";
import {
  axisProps,
  CHART_HEIGHT,
  cursorBand,
  gridProps,
  hoveredRow,
  roundedBar,
  ticksBetween,
} from "./chartUtils";
import { TooltipCard } from "./ChartTooltip";

type BinRow = HistogramBin & { mid: number };

const fillBySide = roundedBar<BinRow>((bin) =>
  bin.from_mw >= 0 ? "var(--diverging-over)" : "var(--diverging-under)",
);

/** How often each size of error occurred, on a continuous error axis (GW). */
export function ErrorHistogram({ bins }: { bins: HistogramBin[] }) {
  if (bins.length === 0) return null;
  const rows: BinRow[] = bins.map((bin) => ({ ...bin, mid: (bin.from_mw + bin.to_mw) / 2 }));
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const lo = bins[0]!.from_mw;
  const hi = bins[bins.length - 1]!.to_mw;
  const step = hi - lo > 8000 ? 2000 : 1000;
  const ticks = ticksBetween(Math.ceil(lo / step) * step, Math.floor(hi / step) * step, step);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="6%">
        <CartesianGrid {...gridProps} />
        <XAxis
          {...axisProps}
          dataKey="mid"
          type="number"
          domain={[lo, hi]}
          ticks={ticks}
          tickFormatter={gwTick}
        />
        <YAxis {...axisProps} width={44} allowDecimals={false} />
        <ReferenceLine x={0} stroke="var(--axis-ink)" />
        <Tooltip
          cursor={cursorBand}
          content={(props) => {
            const bin = hoveredRow<BinRow>(props);
            if (!bin) return null;
            return (
              <TooltipCard
                title={`Error ${formatSignedGW(bin.from_mw, 1)} to ${formatSignedGW(bin.to_mw, 1)}`}
                rows={[
                  { label: "hours", value: String(bin.count) },
                  { label: "of all hours", value: formatPercent(total ? bin.count / total : 0, 1) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="count" shape={fillBySide} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
