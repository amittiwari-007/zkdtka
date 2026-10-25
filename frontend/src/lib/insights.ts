// Plain-language findings derived from an accuracy report, shown at the top of the
// accuracy view. Each rule only fires when the data supports it.
import type { AccuracyReport } from "../api/types";
import { formatGW, formatPercent, formatSignedGW } from "./format";

export interface Insight {
  id: string;
  headline: string;
  detail: string;
}

const MIN_BUCKET_HOURS = 20;
const MATERIAL_BIAS_SPREAD_MW = 500;
const MATERIAL_IMPROVEMENT = 0.15;

/** Fraction of evaluated hours in which the forecast exceeded the actual output. */
export function overForecastShare(report: AccuracyReport): number | null {
  const points = report.scatter;
  if (points.length === 0) return null;
  return points.filter((p) => p.forecast_mw > p.actual_mw).length / points.length;
}

export function deriveInsights(report: AccuracyReport): Insight[] {
  const insights: Insight[] = [];
  const { summary } = report;
  if (summary.n === 0) return insights;

  const share = overForecastShare(report);
  if (summary.bias_mw !== null && share !== null) {
    const tooHigh = summary.bias_mw >= 0;
    insights.push({
      id: "bias",
      headline: `The forecast was too ${tooHigh ? "high" : "low"} in ${formatPercent(tooHigh ? share : 1 - share)} of hours`,
      detail: tooHigh
        ? `On average it overstated wind by ${formatGW(summary.bias_mw)}. Buying against the raw forecast would usually have left you short.`
        : `On average it understated wind by ${formatGW(-summary.bias_mw)}. Buying against the raw forecast would usually have over-bought.`,
    });
  }

  const margin90 = report.planning_margins.find((m) => m.confidence === 0.9)?.margin_mw;
  const margin50 = report.planning_margins.find((m) => m.confidence === 0.5)?.margin_mw;
  if (margin90 != null) {
    insights.push({
      id: "margin",
      headline: `Plan on forecast ${formatSignedGW(-margin90)} to be covered 90% of the time`,
      detail:
        `In 90% of hours, actual wind was no more than ${formatGW(margin90)} below the forecast` +
        (margin50 != null
          ? `; in half of them the shortfall exceeded ${formatGW(margin50)}.`
          : "."),
    });
  }

  const levels = report.by_forecast_level.filter(
    (level) => level.n >= MIN_BUCKET_HOURS && level.bias_mw !== null,
  );
  const low = levels[0];
  const high = levels[levels.length - 1];
  if (low && high && low !== high && high.bias_mw! - low.bias_mw! > MATERIAL_BIAS_SPREAD_MW) {
    insights.push({
      id: "level",
      headline: "The overestimate grows on windy days",
      detail:
        `When the forecast was ${formatGW(low.level_from_mw, 1)}–${formatGW(low.level_to_mw, 1)} ` +
        `the average error was ${formatSignedGW(low.bias_mw)}; above ${formatGW(high.level_from_mw, 1)} ` +
        `it was ${formatSignedGW(high.bias_mw)}.`,
    });
  }

  const selected = report.decision_time_comparison.find(
    (row) => row.decision_time === report.decision_time,
  );
  const later = report.decision_time_comparison.filter(
    (row) => row.decision_time > report.decision_time && row.mae_mw !== null,
  );
  if (selected?.mae_mw && later.length > 0) {
    const best = later.reduce((a, b) => (b.mae_mw! < a.mae_mw! ? b : a));
    const improvement = 1 - best.mae_mw! / selected.mae_mw;
    insights.push({
      id: "waiting",
      headline:
        improvement < MATERIAL_IMPROVEMENT
          ? "Waiting for later forecasts barely helps"
          : "Later forecasts are noticeably more accurate",
      detail:
        `Deciding at ${best.decision_time} instead of ${report.decision_time} would cut the ` +
        `average error by ${formatPercent(Math.max(improvement, 0))} ` +
        `(${formatGW(selected.mae_mw)} → ${formatGW(best.mae_mw)}).`,
    });
  }

  return insights;
}
