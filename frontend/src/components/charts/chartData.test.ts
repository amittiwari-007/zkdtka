import type { DayView } from "../../api/types";
import dayFixture from "../../test/fixtures/day-2026-01-15.json";
import { buildDayRows } from "./chartData";

const view = dayFixture as DayView;

describe("buildDayRows", () => {
  const rows = buildDayRows(view);

  it("has a row per half-hour plus a closing point", () => {
    expect(rows).toHaveLength(48 + 1);
    expect(new Date(rows[0]!.t).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(new Date(rows[48]!.t).toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("holds each hourly forecast across both of its half-hours", () => {
    const firstHour = view.hourly[0]!.forecast_mw;
    expect(rows[0]!.forecast).toBe(firstHour);
    expect(rows[1]!.forecast).toBe(firstHour);
    expect(rows[2]!.forecast).toBe(view.hourly[1]!.forecast_mw);
  });

  it("extends the last hour to the end of the day without inventing an actual", () => {
    expect(rows[48]!.forecast).toBe(view.hourly[23]!.forecast_mw);
    expect(rows[48]!.actual).toBeNull();
  });

  it("keeps the half-hourly actuals", () => {
    expect(rows[1]!.actual).toBe(view.actuals[1]!.actual_mw);
  });

  it("exposes every forecast run by publish time", () => {
    expect(Object.keys(rows[0]!.runs)).toEqual(view.runs.map((run) => run.publish_time));
  });

  it("returns nothing for an empty day", () => {
    expect(buildDayRows({ ...view, hourly: [] })).toEqual([]);
  });
});
