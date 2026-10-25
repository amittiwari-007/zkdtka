// Display formatting. All times are shown in UK local time (Europe/London), the market's clock.

export const UK_TIME_ZONE = "Europe/London";
const DASH = "—";
const MINUS = "−";

type Num = number | null | undefined;

const isNum = (value: Num): value is number => typeof value === "number" && Number.isFinite(value);

export function formatGW(mw: Num, digits = 2): string {
  return isNum(mw) ? `${(mw / 1000).toFixed(digits)} GW` : DASH;
}

/** Signed with a true minus sign: "+1.75 GW", "−0.40 GW". */
export function formatSignedGW(mw: Num, digits = 2): string {
  if (!isNum(mw)) return DASH;
  const sign = mw > 0 ? "+" : mw < 0 ? MINUS : "";
  return `${sign}${Math.abs(mw / 1000).toFixed(digits)} GW`;
}

export function formatMW(mw: Num): string {
  return isNum(mw) ? `${Math.round(mw).toLocaleString("en-GB")} MW` : DASH;
}

export function formatSignedMW(mw: Num): string {
  if (!isNum(mw)) return DASH;
  const sign = mw > 0 ? "+" : mw < 0 ? MINUS : "";
  return `${sign}${Math.abs(Math.round(mw)).toLocaleString("en-GB")} MW`;
}

export function formatGWh(mwh: Num): string {
  return isNum(mwh)
    ? `${(mwh / 1000).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GWh`
    : DASH;
}

export function formatPercent(fraction: Num, digits = 0): string {
  return isNum(fraction) ? `${(fraction * 100).toFixed(digits)}%` : DASH;
}

export function formatHours(hours: Num): string {
  return isNum(hours) ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h` : DASH;
}

/** Axis tick: compact GW without trailing zeros ("0", "2.5", "10"). */
export function gwTick(mw: number): string {
  return `${Number((mw / 1000).toFixed(1))}`;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const shortDayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  day: "numeric",
  month: "short",
});

/** "14:30" in UK time, from an ISO timestamp or epoch ms. */
export function formatTimeUK(value: string | number): string {
  return timeFormat.format(new Date(value));
}

/** "Wed 14 Jan, 07:30" in UK time. */
export function formatDayTimeUK(value: string | number): string {
  return dayTimeFormat.format(new Date(value));
}

/** "14 Jan" in UK time, from an ISO timestamp or epoch ms. */
export function formatShortDayUK(value: string | number): string {
  return shortDayFormat.format(new Date(value));
}

// Calendar dates ("2026-01-15") carry no time zone: format them as plain dates (UTC midnight).
// Assembled from parts so the punctuation is identical across browsers and ICU versions.
const datePartsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const parseDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

function dateParts(isoDate: string) {
  const parts = datePartsFormat.formatToParts(parseDate(isoDate));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return { weekday: get("weekday"), day: get("day"), month: get("month"), year: get("year") };
}

/** "Thu 15 Jan 2026" */
export function formatDate(isoDate: string): string {
  const { weekday, day, month, year } = dateParts(isoDate);
  return `${weekday} ${day} ${month} ${year}`;
}

/** "Thu 15 Jan" */
export function formatDateShort(isoDate: string): string {
  const { weekday, day, month } = dateParts(isoDate);
  return `${weekday} ${day} ${month}`;
}

/** Calendar arithmetic on "YYYY-MM-DD" strings. */
export function addDays(isoDate: string, days: number): string {
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function clampDate(isoDate: string, min: string, max: string): string {
  if (isoDate < min) return min;
  if (isoDate > max) return max;
  return isoDate;
}

export const isIsoDate = (value: string | null | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime());

export const isHhMm = (value: string | null | undefined): value is string =>
  !!value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Minutes between two instants, as "1 h 50 min". */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const parts = [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean);
  return parts.join(" ") || "0 min";
}
