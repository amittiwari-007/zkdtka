// Shared chart chrome: recessive solid hairline grid/axes, round GW axes and bars with a
// 4px rounded data-end that stays square at the baseline.
import type { ReactElement } from "react";

export const CHART_HEIGHT = 300;

export const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--axis-ink)", fontSize: 12 },
  tickLine: false,
} as const;

export const gridProps = {
  stroke: "var(--grid)",
  vertical: false,
} as const;

export const cursorLine = { stroke: "var(--axis-ink)", strokeWidth: 1 } as const;
export const cursorBand = { fill: "var(--accent-wash)" } as const;

export const activeDot = { r: 4, stroke: "var(--surface)", strokeWidth: 2 } as const;

/** First data row under the tooltip, if active. Recharts passes it as payload[0].payload. */
export function hoveredRow<Row>(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}): Row | undefined {
  if (!props.active || !props.payload?.length) return undefined;
  return props.payload[0]?.payload as Row | undefined;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: unknown;
}

/**
 * Bar shape factory: rounds the end away from the baseline (top for positive values, bottom
 * for negative ones) and colours each bar via `fill(row)`.
 */
export function roundedBar<Row>(fill: (row: Row) => string, isNegative?: (row: Row) => boolean) {
  return function RoundedBar(props: unknown): ReactElement {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props as BarShapeProps;
    const row = payload as Row;
    const h = Math.abs(height);
    if (width <= 0 || h === 0) return <g />;
    const top = Math.min(y, y + height);
    const r = Math.min(4, h, width / 2);
    const negative = isNegative?.(row) ?? false;
    const d = negative
      ? `M${x},${top} H${x + width} V${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} H${x + r} Q${x},${top + h} ${x},${top + h - r} Z`
      : `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`;
    return <path d={d} fill={fill(row)} />;
  };
}

const TICK_STEPS_MW = [250, 500, 1000, 2000, 2500, 5000, 10000];

/**
 * A GW value axis that always includes zero, with a round step (in MW) and at most ~6 ticks,
 * e.g. 0 / 5 / 10 / 15 / 20 GW rather than Recharts' 0 / 5.5 / 11 / 16.5.
 */
export function gwAxis(values: Array<number | null | undefined>) {
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const step = TICK_STEPS_MW.find((s) => (max - min) / s <= 6) ?? 10000;
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);
  return { domain: [lo, hi] as [number, number], ticks: ticksBetween(lo, hi, step) };
}

/** Evenly spaced ticks from `start` to `end` (inclusive) every `step`. */
export function ticksBetween(start: number, end: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step) ticks.push(t);
  return ticks;
}
