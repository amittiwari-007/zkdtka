// Friendly names for the response types generated from the backend's OpenAPI schema
// (`npm run gen:api`). The backend is the single source of truth for the API contract.
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Meta = Schemas["Meta"];
export type DecisionTimePreset = Schemas["DecisionTimePresetOut"];
export type DataInfo = Schemas["DataInfo"];

export type DayView = Schemas["DayView"];
export type DayHour = Schemas["DayHour"];
export type DaySummary = Schemas["DaySummary"];
export type ForecastRun = Schemas["ForecastRun"];
export type HalfHourActual = Schemas["HalfHourActual"];

export type AccuracyReport = Schemas["AccuracyReport"];
export type ErrorSummary = Schemas["ErrorSummary"];
export type PlanningMargin = Schemas["PlanningMargin"];
export type HourOfDayStat = Schemas["HourOfDayStat"];
export type HorizonStat = Schemas["HorizonStat"];
export type ForecastLevelStat = Schemas["ForecastLevelStat"];
export type DailyStat = Schemas["DailyStat"];
export type HistogramBin = Schemas["HistogramBin"];
export type ScatterPoint = Schemas["ScatterPoint"];
export type DecisionTimeStat = Schemas["DecisionTimeStat"];
