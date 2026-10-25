import { useAccuracy } from "../api/hooks";
import type {
  AccuracyReport,
  DailyStat,
  DecisionTimeStat,
  ForecastLevelStat,
  HistogramBin,
  HorizonStat,
  HourOfDayStat,
  PlanningMargin,
  ScatterPoint,
} from "../api/types";
import { ChartCard } from "../components/ChartCard";
import {
  buildMonthRows,
  leadTimeLabel,
  levelLabel,
  type MonthRow,
} from "../components/charts/chartData";
import { DailyErrorChart } from "../components/charts/DailyErrorChart";
import { DecisionTimeChart } from "../components/charts/DecisionTimeChart";
import { ErrorHistogram } from "../components/charts/ErrorHistogram";
import { ForecastActualScatter } from "../components/charts/ForecastActualScatter";
import { ForecastLevelChart } from "../components/charts/ForecastLevelChart";
import { HourOfDayChart } from "../components/charts/HourOfDayChart";
import { LeadTimeChart } from "../components/charts/LeadTimeChart";
import { MonthChart } from "../components/charts/MonthChart";
import { KpiTile } from "../components/KpiTile";
import { ErrorState, Loading } from "../components/Status";
import {
  formatDateShort,
  formatDayTimeUK,
  formatGW,
  formatHours,
  formatPercent,
  formatSignedGW,
  gwTick,
} from "../lib/format";
import { deriveInsights, overForecastShare } from "../lib/insights";

const OVER = { color: "var(--diverging-over)", kind: "bar" } as const;
const UNDER = { color: "var(--diverging-under)", kind: "bar" } as const;

interface AccuracyViewProps {
  from: string;
  to: string;
  decisionTime: string;
  onOpenDay: (deliveryDate: string) => void;
}

/** How accurate the forecasts available at decision time were, quantified several ways. */
export function AccuracyView({ from, to, decisionTime, onOpenDay }: AccuracyViewProps) {
  const query = useAccuracy(from, to, decisionTime);

  if (query.isPending) return <Loading label="Calculating forecast accuracy…" />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const report = query.data;
  const refreshing = query.isPlaceholderData;

  if (report.summary.n === 0) {
    return (
      <div className="card status">
        No hours with both a forecast and an actual value in this range. Try a wider range.
      </div>
    );
  }

  return (
    <div className={`stack${refreshing ? " is-refreshing" : ""}`} aria-busy={refreshing}>
      <Headline report={report} />
      <SummaryKpis report={report} />
      <PlanningMargins report={report} />

      <ChartCard
        title="Forecast at decision time vs actual, hour by hour"
        subtitle={`Delivery ${formatDateShort(report.delivery_date_from)} – ${formatDateShort(report.delivery_date_to)} · GW · drag the handles below to zoom`}
        legend={[
          { label: "Forecast at decision time", color: "var(--series-forecast)", kind: "line" },
          { label: "Actual (hourly mean)", color: "var(--series-actual)", kind: "line" },
        ]}
        table={{
          caption: "Hourly forecast at decision time and actual wind generation",
          rowKey: (row: MonthRow) => String(row.t),
          rows: buildMonthRows(report.scatter),
          columns: [
            { key: "t", header: "Hour (UK)", render: (r: MonthRow) => formatDayTimeUK(r.t) },
            {
              key: "f",
              header: "Forecast",
              numeric: true,
              render: (r: MonthRow) => formatGW(r.forecast),
            },
            {
              key: "a",
              header: "Actual",
              numeric: true,
              render: (r: MonthRow) => formatGW(r.actual),
            },
            {
              key: "e",
              header: "Error",
              numeric: true,
              render: (r: MonthRow) => formatSignedGW(r.forecast - r.actual),
            },
          ],
        }}
      >
        <MonthChart rows={buildMonthRows(report.scatter)} />
      </ChartCard>

      <ChartCard
        title="Mean error by delivery day"
        subtitle="Above zero: forecast too high (risk of buying too little) · click a bar to open that day"
        legend={[
          { label: "Forecast too high", ...OVER },
          { label: "Forecast too low", ...UNDER },
        ]}
        table={{
          caption: "Forecast error by delivery day",
          rowKey: (day: DailyStat) => day.delivery_date,
          rows: report.by_day,
          columns: dailyColumns,
        }}
      >
        <DailyErrorChart days={report.by_day} onSelectDay={onOpenDay} />
      </ChartCard>

      <div className="chart-grid">
        <ChartCard
          title="How big the errors were"
          subtitle="Hours by size of error (forecast − actual), 0.5 GW bins"
          legend={[
            { label: "Forecast too high", ...OVER },
            { label: "Forecast too low", ...UNDER },
          ]}
          table={{
            caption: "Distribution of hourly forecast errors",
            rowKey: (bin: HistogramBin) => String(bin.from_mw),
            rows: report.histogram,
            columns: [
              {
                key: "bin",
                header: "Error (GW)",
                render: (b: HistogramBin) => `${gwTick(b.from_mw)} to ${gwTick(b.to_mw)}`,
              },
              {
                key: "count",
                header: "Hours",
                numeric: true,
                render: (b: HistogramBin) => b.count,
              },
            ],
          }}
        >
          <ErrorHistogram bins={report.histogram} />
        </ChartCard>

        <ChartCard
          title="Error by hour of day"
          subtitle="Mean error and the middle 80% of errors, by UK delivery hour"
          legend={[
            { label: "Mean error", color: "var(--series-forecast)", kind: "line" },
            { label: "Middle 80% of errors", color: "var(--band)", kind: "area" },
          ]}
          table={{
            caption: "Forecast error by hour of day",
            rowKey: (h: HourOfDayStat) => String(h.hour),
            rows: report.by_hour_of_day,
            columns: hourColumns,
          }}
        >
          <HourOfDayChart hours={report.by_hour_of_day} />
        </ChartCard>

        <ChartCard
          title="Error grows with lead time"
          subtitle="Mean absolute error of every forecast run, by hours between publication and delivery"
          table={{
            caption: "Forecast error by lead time",
            rowKey: (h: HorizonStat) => String(h.horizon_from_h),
            rows: report.by_horizon,
            columns: [
              { key: "lead", header: "Lead time", render: (h: HorizonStat) => leadTimeLabel(h) },
              {
                key: "mae",
                header: "MAE",
                numeric: true,
                render: (h: HorizonStat) => formatGW(h.mae_mw),
              },
              {
                key: "bias",
                header: "Bias",
                numeric: true,
                render: (h: HorizonStat) => formatSignedGW(h.bias_mw),
              },
              { key: "n", header: "Hours", numeric: true, render: (h: HorizonStat) => h.n },
            ],
          }}
        >
          <LeadTimeChart horizons={report.by_horizon} />
        </ChartCard>

        <ChartCard
          title="Error by forecast wind level"
          subtitle="Mean error grouped by how much wind was forecast (GW)"
          legend={[
            { label: "Forecast too high", ...OVER },
            { label: "Forecast too low", ...UNDER },
          ]}
          table={{
            caption: "Forecast error by forecast level",
            rowKey: (l: ForecastLevelStat) => String(l.level_from_mw),
            rows: report.by_forecast_level,
            columns: [
              {
                key: "level",
                header: "Forecast (GW)",
                render: (l: ForecastLevelStat) => levelLabel(l),
              },
              {
                key: "bias",
                header: "Bias",
                numeric: true,
                render: (l: ForecastLevelStat) => formatSignedGW(l.bias_mw),
              },
              {
                key: "mae",
                header: "MAE",
                numeric: true,
                render: (l: ForecastLevelStat) => formatGW(l.mae_mw),
              },
              { key: "n", header: "Hours", numeric: true, render: (l: ForecastLevelStat) => l.n },
            ],
          }}
        >
          <ForecastLevelChart levels={report.by_forecast_level} />
        </ChartCard>

        <ChartCard
          title="Would deciding later help?"
          subtitle="Mean absolute error if the purchase were decided at other times on the day before"
          legend={[
            {
              label: `Selected (${report.decision_time})`,
              color: "var(--series-forecast)",
              kind: "bar",
            },
            { label: "Other decision times", color: "var(--context)", kind: "bar" },
          ]}
          table={{
            caption: "Forecast error by decision time",
            rowKey: (row: DecisionTimeStat) => row.decision_time,
            rows: report.decision_time_comparison,
            columns: decisionTimeColumns,
          }}
        >
          <DecisionTimeChart
            rows={report.decision_time_comparison}
            selected={report.decision_time}
          />
        </ChartCard>

        <ChartCard
          title="Forecast vs actual, every hour"
          subtitle="Dots below the diagonal: forecast was too high · GW"
          table={{
            caption: "Forecast and actual for every evaluated hour",
            rowKey: (p: ScatterPoint) => p.start_time,
            rows: report.scatter,
            columns: [
              {
                key: "t",
                header: "Hour (UK)",
                render: (p: ScatterPoint) => formatDayTimeUK(p.start_time),
              },
              {
                key: "f",
                header: "Forecast",
                numeric: true,
                render: (p: ScatterPoint) => formatGW(p.forecast_mw),
              },
              {
                key: "a",
                header: "Actual",
                numeric: true,
                render: (p: ScatterPoint) => formatGW(p.actual_mw),
              },
            ],
          }}
        >
          <ForecastActualScatter points={report.scatter} />
        </ChartCard>
      </div>
    </div>
  );
}

function Headline({ report }: { report: AccuracyReport }) {
  const { summary } = report;
  const share = overForecastShare(report);
  const insights = deriveInsights(report);
  return (
    <section className="card hero" aria-label="Headline">
      <div>
        <div className="hero-figure">{formatSignedGW(summary.bias_mw)}</div>
        <p className="hero-label">
          Average error of the forecast available at {report.decision_time}
          {share != null && <> · too high in {formatPercent(share)} of hours</>}. Positive means the
          forecast promised more wind than arrived.
        </p>
      </div>
      <div className="insights">
        {insights.map((insight) => (
          <article key={insight.id} className="insight">
            <h3>{insight.headline}</h3>
            <p>{insight.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryKpis({ report }: { report: AccuracyReport }) {
  const { summary, coverage } = report;
  return (
    <div className="kpi-grid">
      <KpiTile
        label="Mean absolute error"
        value={formatGW(summary.mae_mw)}
        sub={`Typical miss in either direction`}
      />
      <KpiTile label="RMSE" value={formatGW(summary.rmse_mw)} sub="Weights large misses more" />
      <KpiTile
        label="90% of hours within"
        value={`±${formatGW(summary.p90_abs_error_mw)}`}
        sub={`Worst hour ${formatSignedGW(summary.max_over_forecast_mw)}`}
      />
      <KpiTile
        label="Error vs energy delivered"
        value={formatPercent(summary.wape, 1)}
        sub="Total absolute error ÷ total actual"
      />
      <KpiTile
        label="Hours evaluated"
        value={coverage.hours_evaluated.toLocaleString("en-GB")}
        sub={
          coverage.hours_evaluated === coverage.target_hours
            ? "Complete coverage"
            : `${coverage.target_hours - coverage.hours_evaluated} of ${coverage.target_hours} hours missing data`
        }
        subTone={coverage.hours_evaluated < coverage.target_hours ? "bad" : undefined}
      />
    </div>
  );
}

function PlanningMargins({ report }: { report: AccuracyReport }) {
  return (
    <section className="card" aria-labelledby="margins-title">
      <div className="chart-card-header">
        <div>
          <h3 id="margins-title">How much wind to count on</h3>
          <p>
            Subtract this margin from the forecast to be covered with the given confidence, based on
            the errors in the selected period.
          </p>
        </div>
      </div>
      <div className="kpi-grid">
        {report.planning_margins.map((margin: PlanningMargin) => (
          <KpiTile
            key={margin.confidence}
            label={`${formatPercent(margin.confidence)} confidence`}
            value={formatSignedGW(margin.margin_mw != null ? -margin.margin_mw : null)}
            sub={`Actual ≥ forecast ${formatSignedGW(margin.margin_mw != null ? -margin.margin_mw : null)} in ${formatPercent(margin.confidence)} of hours`}
          />
        ))}
      </div>
    </section>
  );
}

const dailyColumns = [
  {
    key: "date",
    header: "Delivery day",
    render: (d: DailyStat) => formatDateShort(d.delivery_date),
  },
  {
    key: "bias",
    header: "Bias",
    numeric: true,
    render: (d: DailyStat) => formatSignedGW(d.bias_mw),
  },
  { key: "mae", header: "MAE", numeric: true, render: (d: DailyStat) => formatGW(d.mae_mw) },
  {
    key: "max",
    header: "Worst hour",
    numeric: true,
    render: (d: DailyStat) => formatGW(d.max_abs_error_mw),
  },
  {
    key: "fe",
    header: "Forecast GWh",
    numeric: true,
    render: (d: DailyStat) => (d.forecast_energy_mwh / 1000).toFixed(1),
  },
  {
    key: "ae",
    header: "Actual GWh",
    numeric: true,
    render: (d: DailyStat) => (d.actual_energy_mwh / 1000).toFixed(1),
  },
];

const hourColumns = [
  {
    key: "hour",
    header: "Hour (UK)",
    render: (h: HourOfDayStat) => `${String(h.hour).padStart(2, "0")}:00`,
  },
  {
    key: "bias",
    header: "Bias",
    numeric: true,
    render: (h: HourOfDayStat) => formatSignedGW(h.bias_mw),
  },
  { key: "mae", header: "MAE", numeric: true, render: (h: HourOfDayStat) => formatGW(h.mae_mw) },
  {
    key: "p10",
    header: "P10 error",
    numeric: true,
    render: (h: HourOfDayStat) => formatSignedGW(h.p10_error_mw),
  },
  {
    key: "p90",
    header: "P90 error",
    numeric: true,
    render: (h: HourOfDayStat) => formatSignedGW(h.p90_error_mw),
  },
];

const decisionTimeColumns = [
  {
    key: "time",
    header: "Decision time",
    render: (r: DecisionTimeStat) =>
      r.label ? `${r.decision_time} (${r.label})` : r.decision_time,
  },
  { key: "mae", header: "MAE", numeric: true, render: (r: DecisionTimeStat) => formatGW(r.mae_mw) },
  {
    key: "bias",
    header: "Bias",
    numeric: true,
    render: (r: DecisionTimeStat) => formatSignedGW(r.bias_mw),
  },
  {
    key: "p90",
    header: "P90 |error|",
    numeric: true,
    render: (r: DecisionTimeStat) => formatGW(r.p90_abs_error_mw),
  },
  {
    key: "lead",
    header: "Typical lead time",
    numeric: true,
    render: (r: DecisionTimeStat) => formatHours(r.median_horizon_h),
  },
];
