import { useEffect, useState } from "react";

import { useMeta } from "./api/hooks";
import type { Meta } from "./api/types";
import {
  DecisionDatePicker,
  DecisionTimePicker,
  DeliveryRangePicker,
  ViewSwitch,
} from "./components/controls";
import { ErrorState, Loading } from "./components/Status";
import { addDays, formatDayTimeUK } from "./lib/format";
import { readState, toSearch, type DashboardState } from "./lib/urlState";
import { AccuracyView } from "./views/AccuracyView";
import { DecisionView } from "./views/DecisionView";
import { MethodologyPanel } from "./views/MethodologyPanel";

export function App() {
  const meta = useMeta();
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <div>
            <h1>Wind Forecast Desk</h1>
            <p>GB national wind generation for day-ahead purchasing</p>
          </div>
        </div>
        {meta.data && (
          <span className="data-badge">
            Elexon BMRS · {meta.data.data.source === "live" ? "live" : "snapshot"} ·{" "}
            {formatDayTimeUK(meta.data.data.fetched_at)}
          </span>
        )}
      </header>
      {meta.isPending ? (
        <Loading label="Loading wind data…" />
      ) : meta.isError ? (
        <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
      ) : (
        <Dashboard meta={meta.data} />
      )}
      <footer className="app-footer">
        Data: Elexon BMRS (FUELHH, WINDFOR). All times UK local unless stated.
      </footer>
    </div>
  );
}

function Dashboard({ meta }: { meta: Meta }) {
  const [state, setState] = useState<DashboardState>(() => readState(window.location.search, meta));

  useEffect(() => {
    const search = toSearch(state);
    if (search !== window.location.search) window.history.replaceState(null, "", search);
  }, [state]);

  const update = (patch: Partial<DashboardState>) => setState((s) => ({ ...s, ...patch }));

  const openDay = (deliveryDate: string) => {
    update({ view: "decision", decisionDate: addDays(deliveryDate, -1) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div className="filter-row">
        <ViewSwitch value={state.view} onChange={(view) => update({ view })} />
        <DecisionTimePicker
          presets={meta.decision_time_presets}
          value={state.decisionTime}
          onChange={(decisionTime) => update({ decisionTime })}
        />
        {state.view === "decision" ? (
          <DecisionDatePicker
            value={state.decisionDate}
            min={meta.decision_date_from}
            max={meta.decision_date_to}
            onChange={(decisionDate) => update({ decisionDate })}
          />
        ) : (
          <DeliveryRangePicker
            from={state.from}
            to={state.to}
            min={meta.delivery_date_from}
            max={meta.delivery_date_to}
            onChange={(range) => update(range)}
          />
        )}
      </div>
      <main className="stack">
        {state.view === "decision" ? (
          <DecisionView decisionDate={state.decisionDate} decisionTime={state.decisionTime} />
        ) : (
          <AccuracyView
            from={state.from}
            to={state.to}
            decisionTime={state.decisionTime}
            onOpenDay={openDay}
          />
        )}
        <MethodologyPanel meta={meta} />
      </main>
    </>
  );
}
