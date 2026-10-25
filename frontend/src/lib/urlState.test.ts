import type { Meta } from "../api/types";
import metaFixture from "../test/fixtures/meta.json";
import { readState, toSearch } from "./urlState";

const meta = metaFixture as Meta;

describe("readState", () => {
  it("defaults to the latest decision at the default time", () => {
    expect(readState("", meta)).toEqual({
      view: "decision",
      decisionDate: "2026-01-31",
      decisionTime: "09:20",
      from: "2026-01-02",
      to: "2026-02-01",
    });
  });

  it("reads a shared link", () => {
    const state = readState("?view=accuracy&time=09:50&from=2026-01-05&to=2026-01-10", meta);
    expect(state).toMatchObject({
      view: "accuracy",
      decisionTime: "09:50",
      from: "2026-01-05",
      to: "2026-01-10",
    });
  });

  it("clamps dates outside the analysed period", () => {
    expect(readState("?date=2025-12-01", meta).decisionDate).toBe("2026-01-01");
    expect(readState("?date=2026-03-01", meta).decisionDate).toBe("2026-01-31");
  });

  it("ignores malformed values", () => {
    const state = readState("?view=nope&date=yesterday&time=25:99", meta);
    expect(state.view).toBe("decision");
    expect(state.decisionDate).toBe("2026-01-31");
    expect(state.decisionTime).toBe("09:20");
  });

  it("resets an inverted range", () => {
    const state = readState("?from=2026-01-20&to=2026-01-10", meta);
    expect([state.from, state.to]).toEqual(["2026-01-02", "2026-02-01"]);
  });
});

describe("toSearch", () => {
  it("only includes parameters relevant to the view", () => {
    const base = readState("", meta);
    expect(toSearch(base)).toBe("?view=decision&time=09%3A20&date=2026-01-31");
    expect(toSearch({ ...base, view: "accuracy" })).toBe(
      "?view=accuracy&time=09%3A20&from=2026-01-02&to=2026-02-01",
    );
  });
});
