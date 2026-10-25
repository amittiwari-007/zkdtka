// Pure data shaping for the charts (no rendering), kept apart so it can be unit-tested.
import type { DayView, ForecastLevelStat, HorizonStat, ScatterPoint } from "../../api/types";
import { gwTick } from "../../lib/format";

export const HALF_HOUR_MS = 30 * 60 * 1000;
export const HOUR_MS = 2 * HALF_HOUR_MS;

export interface DayRow {
  t: number;
  actual: number | null;
  forecast: number | null;
  band: [number, number] | null;
  hourError: number | null;
  publishTime: string | null;
  horizonH: number | null;
  runs: Record<string, number | null>;
}

/**
 * One row per half-hour (plus a closing point at the end of the day) so the hourly forecast
 * can be drawn as steps across its whole hour next to the half-hourly actuals.
 */
export function buildDayRows(view: DayView): DayRow[] {
  if (view.hourly.length === 0) return [];
  const hourly = new Map(view.hourly.map((hour) => [Date.parse(hour.start_time), hour]));
  const actuals = new Map(view.actuals.map((a) => [Date.parse(a.start_time), a.actual_mw]));
  const runs = view.runs.map((run) => ({
    key: run.publish_time,
    values: new Map(run.points.map((p) => [Date.parse(p.start_time), p.forecast_mw])),
  }));

  const start = Date.parse(view.hourly[0]!.start_time);
  const end = Date.parse(view.hourly[view.hourly.length - 1]!.start_time) + HOUR_MS;
  const rows: DayRow[] = [];
  for (let t = start; t <= end; t += HALF_HOUR_MS) {
    const hourStart = t === end ? end - HOUR_MS : t - ((t - start) % HOUR_MS);
    const hour = hourly.get(hourStart);
    const low = hour?.likely_low_mw;
    const high = hour?.likely_high_mw;
    rows.push({
      t,
      actual: t === end ? null : (actuals.get(t) ?? null),
      forecast: hour?.forecast_mw ?? null,
      band: low != null && high != null ? [low, high] : null,
      hourError: hour?.error_mw ?? null,
      publishTime: hour?.publish_time ?? null,
      horizonH: hour?.horizon_h ?? null,
      runs: Object.fromEntries(runs.map((run) => [run.key, run.values.get(hourStart) ?? null])),
    });
  }
  return rows;
}

export interface MonthRow {
  t: number;
  forecast: number;
  actual: number;
}

export function buildMonthRows(points: ScatterPoint[]): MonthRow[] {
  return points
    .map((p) => ({ t: Date.parse(p.start_time), forecast: p.forecast_mw, actual: p.actual_mw }))
    .sort((a, b) => a.t - b.t);
}

export const leadTimeLabel = (h: HorizonStat) => `${h.horizon_from_h}–${h.horizon_to_h} h`;

export const levelLabel = (level: ForecastLevelStat) =>
  `${gwTick(level.level_from_mw)}–${gwTick(level.level_to_mw)}`;
