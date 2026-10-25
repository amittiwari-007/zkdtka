import type { AccuracyReport } from "../api/types";
import accuracyFixture from "../test/fixtures/accuracy-week1.json";
import { deriveInsights, overForecastShare } from "./insights";

const report = accuracyFixture as AccuracyReport;

describe("deriveInsights", () => {
  it("summarises the bias direction and share of hours", () => {
    const share = overForecastShare(report)!;
    expect(share).toBeGreaterThan(0.5);
    const bias = deriveInsights(report).find((i) => i.id === "bias")!;
    expect(bias.headline).toMatch(/^The forecast was too high in \d+% of hours$/);
    expect(bias.detail).toContain("overstated wind by 1.49 GW");
  });

  it("states the 90% planning margin", () => {
    const margin = deriveInsights(report).find((i) => i.id === "margin")!;
    expect(margin.headline).toBe("Plan on forecast −3.57 GW to be covered 90% of the time");
  });

  it("compares the selected decision time with the best later one", () => {
    const waiting = deriveInsights(report).find((i) => i.id === "waiting")!;
    // Best later time in this week is 12:00 (1.77 GW) vs 09:20 (1.89 GW).
    expect(waiting.detail).toContain("Deciding at 12:00 instead of 09:20");
    expect(waiting.headline).toBe("Waiting for later forecasts barely helps");
  });

  it("returns nothing for an empty report", () => {
    const empty = { ...report, summary: { ...report.summary, n: 0 }, scatter: [] };
    expect(deriveInsights(empty)).toEqual([]);
  });

  it("describes under-forecasting when the bias is negative", () => {
    const flipped: AccuracyReport = {
      ...report,
      summary: { ...report.summary, bias_mw: -800 },
      scatter: report.scatter.map((p) => ({ ...p, actual_mw: p.forecast_mw + 500 })),
    };
    const bias = deriveInsights(flipped).find((i) => i.id === "bias")!;
    expect(bias.headline).toBe("The forecast was too low in 100% of hours");
    expect(bias.detail).toContain("understated wind by 0.80 GW");
  });
});
