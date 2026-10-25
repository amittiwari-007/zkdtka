import { useState } from "react";

import { useDayView } from "../api/hooks";
import type { DayHour, DayView } from "../api/types";
import { ChartCard } from "../components/ChartCard";
import { DayChart } from "../components/charts/DayChart";
import { KpiTile } from "../components/KpiTile";
import type { LegendItem } from "../components/Legend";
import { ErrorState, Loading } from "../components/Status";
import {
  addDays,
  formatDate,
  formatDateShort,
  formatDayTimeUK,
  formatDuration,
  formatGW,
  formatGWh,
  formatHours,
  formatPercent,
  formatSignedGW,
  formatTimeUK,
} from "../lib/format";

interface DecisionViewProps {
  decisionDate: string;
  decisionTime: string;
}

/** What the buyer knew when deciding (D-1), and how the delivery day (D) turned out. */
export function DecisionView({ decisionDate, decisionTime }: DecisionViewProps) {
  const deliveryDate = addDays(decisionDate, 1);
  const query = useDayView(deliveryDate, decisionTime);
  const [showRuns, setShowRuns] = useState(false);

  if (query.isPending) return <Loading label="Loading the decision day…" />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const view = query.data;
  const refreshing = query.isPlaceholderData;

  return (
    <div className={`stack${refreshing ? " is-refreshing" : ""}`} aria-busy={refreshing}>
      <DecisionContext view={view} />
      <DayKpis view={view} />
      <ChartCard
        title="Wind generation: forecast at decision time vs actual"
        subtitle={`Delivery ${formatDate(view.delivery_date)} · UK time · GW`}
        legend={dayLegend(view, showRuns)}
        actions={
          <button
            type="button"
            className="toggle"
            aria-pressed={showRuns}
            onClick={() => setShowRuns((value) => !value)}
          >
            Other forecast runs
          </button>
        }
        footnote={
          `The forecast is the latest run published before the ${view.decision_time} deadline, ` +
          `drawn as hourly steps. The shaded band is where actual wind fell in ` +
          `${Math.round(view.band_confidence * 100)}% of hours on the other days analysed.`
        }
        table={{
          caption: `Hourly forecast and actual wind generation for ${view.delivery_date}`,
          rowKey: (hour) => hour.start_time,
          rows: view.hourly,
          columns: hourlyColumns,
        }}
      >
        <DayChart view={view} showRuns={showRuns} />
      </ChartCard>
    </div>
  );
}

function DecisionContext({ view }: { view: DayView }) {
  const { summary } = view;
  const latestRun = view.runs_used[view.runs_used.length - 1];
  const horizons = view.hourly.map((h) => h.horizon_h).filter((h): h is number => h !== null);
  const missingHours = summary.target_hours - summary.hours_with_forecast;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="context">
        <h2>
          Buying on {formatDateShort(view.decision_date)} at {view.decision_time} for{" "}
          {formatDateShort(view.delivery_date)}
        </h2>
        {latestRun && (
          <p>
            Latest forecast available: published {formatDayTimeUK(latestRun)},{" "}
            {formatDuration(latestRun, view.deadline_utc)} before the deadline, covering the day{" "}
            {formatHours(Math.min(...horizons))}–{formatHours(Math.max(...horizons))} ahead.
          </p>
        )}
      </div>
      {missingHours > 0 && (
        <div className="callout warning" role="note">
          <strong>Incomplete forecast.</strong> {missingHours} of {summary.target_hours} hours had
          no forecast published before the deadline; they are left out of the totals.
        </div>
      )}
      {view.runs_used.length > 1 && (
        <div className="callout info" role="note">
          <strong>Mixed runs.</strong> The latest run did not cover every hour, so some hours use an
          earlier run: {view.runs_used.map((run) => formatTimeUK(run)).join(", ")}.
        </div>
      )}
    </div>
  );
}

function DayKpis({ view }: { view: DayView }) {
  const { summary } = view;
  const avgForecast =
    summary.forecast_energy_mwh != null && summary.hours_with_forecast > 0
      ? summary.forecast_energy_mwh / summary.hours_with_forecast
      : null;
  const planFor =
    avgForecast != null && summary.planning_margin_mw != null
      ? Math.max(0, avgForecast - summary.planning_margin_mw)
      : null;
  const energyGap =
    summary.actual_energy_mwh != null && summary.forecast_energy_mwh
      ? summary.actual_energy_mwh / summary.forecast_energy_mwh - 1
      : null;

  return (
    <div className="kpi-groups">
      <section aria-label="Known at decision time">
        <h3 className="section-title">Known at decision time</h3>
        <div className="kpi-grid">
          <KpiTile
            label="Forecast wind energy"
            value={formatGWh(summary.forecast_energy_mwh)}
            sub={`Average ${formatGW(avgForecast)}`}
          />
          <KpiTile
            label="Forecast range"
            value={`${formatGW(summary.forecast_min_mw, 1)}–${formatGW(summary.forecast_peak_mw, 1)}`}
            sub="Lowest to highest hour"
          />
          <KpiTile
            label="Plan-for wind (90% confidence)"
            value={formatGW(planFor)}
            sub={`Average forecast ${formatSignedGW(summary.planning_margin_mw != null ? -summary.planning_margin_mw : null)}`}
          />
        </div>
      </section>
      <section aria-label="After delivery">
        <h3 className="section-title">After delivery</h3>
        <div className="kpi-grid">
          <KpiTile
            label="Actual wind energy"
            value={formatGWh(summary.actual_energy_mwh)}
            sub={
              energyGap != null
                ? `${energyGap >= 0 ? "+" : "−"}${formatPercent(Math.abs(energyGap), 1)} vs forecast`
                : undefined
            }
            subTone={energyGap != null && energyGap < -0.05 ? "bad" : undefined}
          />
          <KpiTile
            label="Forecast error this day"
            value={formatSignedGW(summary.bias_mw)}
            sub={`Mean absolute error ${formatGW(summary.mae_mw)}`}
          />
        </div>
      </section>
    </div>
  );
}

function dayLegend(view: DayView, showRuns: boolean): LegendItem[] {
  const items: LegendItem[] = [
    { label: "Forecast at decision time", color: "var(--series-forecast)", kind: "line" },
    {
      label: `Likely range (${Math.round(view.band_confidence * 100)}%)`,
      color: "var(--band)",
      kind: "area",
    },
    { label: "Actual (half-hourly)", color: "var(--series-actual)", kind: "line" },
  ];
  if (showRuns) {
    items.push(
      { label: "Earlier runs", color: "var(--context)", kind: "line" },
      { label: "Runs published after the deadline", color: "var(--context)", kind: "dashed" },
    );
  }
  return items;
}

const hourlyColumns = [
  {
    key: "hour",
    header: "Hour (UK)",
    render: (h: DayHour) => formatTimeUK(h.start_time),
  },
  {
    key: "forecast",
    header: "Forecast",
    numeric: true,
    render: (h: DayHour) => formatGW(h.forecast_mw),
  },
  {
    key: "range",
    header: "Likely range",
    numeric: true,
    render: (h: DayHour) =>
      h.likely_low_mw != null && h.likely_high_mw != null
        ? `${formatGW(h.likely_low_mw, 1)}–${formatGW(h.likely_high_mw, 1)}`
        : "—",
  },
  {
    key: "actual",
    header: "Actual (hourly mean)",
    numeric: true,
    render: (h: DayHour) => formatGW(h.actual_mw),
  },
  {
    key: "error",
    header: "Error",
    numeric: true,
    render: (h: DayHour) => formatSignedGW(h.error_mw),
  },
  {
    key: "run",
    header: "Forecast run",
    render: (h: DayHour) => (h.publish_time ? formatDayTimeUK(h.publish_time) : "—"),
  },
  {
    key: "lead",
    header: "Lead time",
    numeric: true,
    render: (h: DayHour) => formatHours(h.horizon_h),
  },
];
