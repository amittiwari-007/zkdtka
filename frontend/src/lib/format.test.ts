import {
  addDays,
  clampDate,
  formatDate,
  formatDuration,
  formatGW,
  formatGWh,
  formatSignedGW,
  formatTimeUK,
  gwTick,
  isHhMm,
  isIsoDate,
} from "./format";

describe("number formatting", () => {
  it("formats MW as GW", () => {
    expect(formatGW(1747.9)).toBe("1.75 GW");
    expect(formatGW(1747.9, 1)).toBe("1.7 GW");
  });

  it("uses a true minus sign and an explicit plus", () => {
    expect(formatSignedGW(1747.9)).toBe("+1.75 GW");
    expect(formatSignedGW(-400)).toBe("−0.40 GW");
    expect(formatSignedGW(0)).toBe("0.00 GW");
  });

  it("shows a dash for missing values", () => {
    expect(formatGW(null)).toBe("—");
    expect(formatSignedGW(undefined)).toBe("—");
    expect(formatGWh(Number.NaN)).toBe("—");
  });

  it("formats energy in GWh", () => {
    expect(formatGWh(278630)).toBe("278.6 GWh");
  });

  it("produces compact axis ticks", () => {
    expect(gwTick(0)).toBe("0");
    expect(gwTick(2500)).toBe("2.5");
    expect(gwTick(10000)).toBe("10");
  });
});

describe("UK time formatting", () => {
  it("shows winter times unchanged from UTC", () => {
    expect(formatTimeUK("2026-01-14T07:30:00Z")).toBe("07:30");
  });

  it("shifts summer times to BST", () => {
    expect(formatTimeUK("2026-07-14T08:20:00Z")).toBe("09:20");
  });

  it("formats calendar dates without time-zone drift", () => {
    expect(formatDate("2026-01-15")).toBe("Thu 15 Jan 2026");
  });

  it("describes durations", () => {
    expect(formatDuration("2026-01-14T07:30:00Z", "2026-01-14T09:20:00Z")).toBe("1 h 50 min");
    expect(formatDuration("2026-01-14T09:20:00Z", "2026-01-14T09:20:00Z")).toBe("0 min");
  });
});

describe("date helpers", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-01", -1)).toBe("2026-01-31");
  });

  it("clamps dates into a range", () => {
    expect(clampDate("2025-12-25", "2026-01-01", "2026-01-31")).toBe("2026-01-01");
    expect(clampDate("2026-03-01", "2026-01-01", "2026-01-31")).toBe("2026-01-31");
    expect(clampDate("2026-01-10", "2026-01-01", "2026-01-31")).toBe("2026-01-10");
  });

  it("validates inputs", () => {
    expect(isIsoDate("2026-01-15")).toBe(true);
    expect(isIsoDate("15/01/2026")).toBe(false);
    expect(isHhMm("09:20")).toBe(true);
    expect(isHhMm("9:20")).toBe(false);
    expect(isHhMm("24:00")).toBe(false);
  });
});
