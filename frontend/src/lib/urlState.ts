// Dashboard selections live in the URL query string so any view can be shared as a link.
import type { Meta } from "../api/types";
import { clampDate, isHhMm, isIsoDate } from "./format";

export type View = "decision" | "accuracy";

export interface DashboardState {
  view: View;
  decisionDate: string;
  decisionTime: string;
  from: string;
  to: string;
}

/** Parse the query string, falling back to sensible defaults for anything missing or invalid. */
export function readState(search: string, meta: Meta): DashboardState {
  const params = new URLSearchParams(search);
  const view = params.get("view") === "accuracy" ? "accuracy" : "decision";

  const date = params.get("date");
  const decisionDate = isIsoDate(date)
    ? clampDate(date, meta.decision_date_from, meta.decision_date_to)
    : meta.decision_date_to;

  const time = params.get("time");
  const decisionTime = isHhMm(time) ? time : meta.default_decision_time;

  const fromParam = params.get("from");
  const toParam = params.get("to");
  let from = isIsoDate(fromParam)
    ? clampDate(fromParam, meta.delivery_date_from, meta.delivery_date_to)
    : meta.delivery_date_from;
  let to = isIsoDate(toParam)
    ? clampDate(toParam, meta.delivery_date_from, meta.delivery_date_to)
    : meta.delivery_date_to;
  if (from > to) [from, to] = [meta.delivery_date_from, meta.delivery_date_to];

  return { view, decisionDate, decisionTime, from, to };
}

export function toSearch(state: DashboardState): string {
  const params = new URLSearchParams({ view: state.view, time: state.decisionTime });
  if (state.view === "decision") {
    params.set("date", state.decisionDate);
  } else {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  return `?${params.toString()}`;
}
