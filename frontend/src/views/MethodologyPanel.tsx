import type { Meta } from "../api/types";
import { formatDate, formatDayTimeUK } from "../lib/format";

/** How the numbers are produced: rules, definitions, data provenance and caveats. */
export function MethodologyPanel({ meta }: { meta: Meta }) {
  const { data } = meta;
  const presets = meta.decision_time_presets.map((p) => `${p.label} ${p.time}`).join(", ");
  return (
    <details className="card method">
      <summary>Method, data and assumptions</summary>
      <div className="method-grid">
        <section>
          <h3>Which forecast counts</h3>
          <p>
            A purchase for delivery day D is decided on D−1 at the chosen UK time (presets:{" "}
            {presets}). For every hour of D we use the forecast with the latest publish time at or
            before that deadline. Anything published later is ignored, because the buyer could not
            have seen it. If the latest run is missing an hour, that hour falls back to the newest
            earlier run that covers it.
          </p>
        </section>
        <section>
          <h3>How accuracy is measured</h3>
          <ul>
            <li>
              Error = forecast − actual. Positive means the forecast was too high, so buying against
              it leaves you short.
            </li>
            <li>
              Forecasts are hourly; actuals are half-hourly. Each hour is compared with the mean of
              its two half-hours, and hours missing a half-hour are skipped.
            </li>
            <li>
              MAE is the average size of the error, RMSE weights large misses more, bias is the
              average signed error, and "error vs energy" is total absolute error ÷ total actual
              output. Percentage errors per hour are not used because they explode when wind is near
              zero.
            </li>
            <li>
              Planning margins and the likely range are empirical error quantiles. On the decision
              view, the band for a day is built from the other days only.
            </li>
          </ul>
        </section>
        <section>
          <h3>Data</h3>
          <ul>
            <li>
              Actuals:{" "}
              <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream">
                Elexon BMRS FUELHH
              </a>{" "}
              (fuel type WIND), {data.actual_rows_received.toLocaleString("en-GB")} half-hours,{" "}
              {data.actual_missing_half_hours} missing.
            </li>
            <li>
              Forecasts:{" "}
              <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream">
                Elexon BMRS WINDFOR
              </a>
              , {data.forecast_runs} runs ({data.forecast_rows_received.toLocaleString("en-GB")}{" "}
              hourly points), usually published at {data.forecast_publish_schedule_utc.join(", ")}{" "}
              UTC.
            </li>
            <li>
              Rows rejected by validation: {data.actual_rows_rejected + data.forecast_rows_rejected}
              ; duplicates removed:{" "}
              {data.actual_duplicates_removed + data.forecast_duplicates_removed}.
            </li>
            <li>
              Source: {data.source === "live" ? "fetched live" : "bundled snapshot"} from Elexon,{" "}
              {formatDayTimeUK(data.fetched_at)}.
            </li>
          </ul>
        </section>
        <section>
          <h3>Scope and caveats</h3>
          <ul>
            <li>
              Decisions made {formatDate(meta.decision_date_from)} –{" "}
              {formatDate(meta.decision_date_to)}, i.e. delivery days{" "}
              {formatDate(meta.delivery_date_from)} – {formatDate(meta.delivery_date_to)}. A
              delivery day runs 00:00–24:00 UK time.
            </li>
            <li>
              The forecast stays well above metered output even a few hours ahead, which points to a
              systematic difference rather than weather uncertainty: for example wind farms being
              told to reduce output when the grid is congested, or the two datasets covering
              different sets of wind farms. Worth confirming with Elexon or NESO.
            </li>
            <li>
              One month of data (744 hours) gives indicative, not definitive, error statistics.
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}
