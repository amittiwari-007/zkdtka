"""Result models returned by the analysis layer (and served as-is by the API).

Sign convention used everywhere: error = forecast - actual.
A positive error means the forecast was too high, i.e. relying on it leaves the buyer short.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True)


class ErrorSummary(_Model):
    n: int = Field(description="Number of hours evaluated")
    mae_mw: float | None = Field(description="Mean absolute error")
    rmse_mw: float | None = Field(description="Root mean squared error")
    bias_mw: float | None = Field(description="Mean error; positive = forecast too high")
    wape: float | None = Field(description="Sum of absolute errors / sum of actual output")
    median_abs_error_mw: float | None
    p90_abs_error_mw: float | None = Field(description="90% of hours had a smaller absolute error")
    p10_error_mw: float | None
    p90_error_mw: float | None
    max_over_forecast_mw: float | None = Field(description="Largest positive error")
    max_under_forecast_mw: float | None = Field(description="Largest negative error")
    mean_actual_mw: float | None
    mean_forecast_mw: float | None


class Coverage(_Model):
    target_hours: int
    hours_with_forecast: int
    hours_with_actual: int
    hours_evaluated: int


class PlanningMargin(_Model):
    confidence: float = Field(description="Probability that actual wind >= forecast - margin")
    margin_mw: float | None


class HourOfDayStat(_Model):
    hour: int = Field(description="UK local hour of day, 0-23")
    n: int
    mae_mw: float | None
    bias_mw: float | None
    p10_error_mw: float | None
    p90_error_mw: float | None


class HorizonStat(_Model):
    """Accuracy by lead time (target time - publish time), over every forecast run."""

    horizon_from_h: int
    horizon_to_h: int
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None


class ForecastLevelStat(_Model):
    level_from_mw: int
    level_to_mw: int
    n: int
    mae_mw: float | None
    bias_mw: float | None


class DailyStat(_Model):
    delivery_date: date
    n: int
    mae_mw: float | None
    bias_mw: float | None
    max_abs_error_mw: float | None
    forecast_energy_mwh: float
    actual_energy_mwh: float


class HistogramBin(_Model):
    from_mw: float
    to_mw: float
    count: int


class ScatterPoint(_Model):
    start_time: datetime
    forecast_mw: float
    actual_mw: float


class DecisionTimeStat(_Model):
    decision_time: str = Field(description="UK local time on D-1, HH:MM")
    label: str | None
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p90_abs_error_mw: float | None
    median_horizon_h: float | None


class AccuracyReport(_Model):
    decision_time: str
    delivery_date_from: date
    delivery_date_to: date
    summary: ErrorSummary
    coverage: Coverage
    planning_margins: list[PlanningMargin]
    by_hour_of_day: list[HourOfDayStat]
    by_horizon: list[HorizonStat]
    by_forecast_level: list[ForecastLevelStat]
    by_day: list[DailyStat]
    histogram: list[HistogramBin]
    scatter: list[ScatterPoint]
    decision_time_comparison: list[DecisionTimeStat]


class DayHour(_Model):
    start_time: datetime
    forecast_mw: float | None
    publish_time: datetime | None = Field(description="Run the forecast came from")
    horizon_h: float | None
    actual_mw: float | None = Field(description="Hourly mean of the two half-hour actuals")
    error_mw: float | None
    likely_low_mw: float | None = Field(description="Lower edge of the historical error band")
    likely_high_mw: float | None = Field(description="Upper edge of the historical error band")


class HalfHourActual(_Model):
    start_time: datetime
    actual_mw: float


class RunPoint(_Model):
    start_time: datetime
    forecast_mw: float


class ForecastRun(_Model):
    publish_time: datetime
    available_at_decision: bool
    used: bool
    points: list[RunPoint]


class DaySummary(_Model):
    target_hours: int
    hours_with_forecast: int
    forecast_energy_mwh: float | None
    actual_energy_mwh: float | None
    forecast_peak_mw: float | None
    forecast_min_mw: float | None
    planning_margin_mw: float | None = Field(
        description="Margin, from other days' errors, giving 90% confidence that "
        "actual >= forecast - margin"
    )
    mae_mw: float | None
    bias_mw: float | None


class DayView(_Model):
    delivery_date: date
    decision_date: date
    decision_time: str
    deadline_utc: datetime
    runs_used: list[datetime]
    band_confidence: float = Field(description="Central probability covered by the likely range")
    summary: DaySummary
    hourly: list[DayHour]
    actuals: list[HalfHourActual]
    runs: list[ForecastRun]


class DecisionTimePresetOut(_Model):
    id: str
    label: str
    time: str
    description: str


class DataInfo(_Model):
    source: str
    fetched_at: datetime
    actual_rows_received: int
    actual_rows_rejected: int
    actual_duplicates_removed: int
    actual_missing_half_hours: int
    forecast_rows_received: int
    forecast_rows_rejected: int
    forecast_duplicates_removed: int
    forecast_runs: int
    forecast_publish_schedule_utc: list[str] = Field(
        description="Usual run publication times (HH:MM UTC), most frequent first"
    )


class Meta(_Model):
    timezone: str
    decision_date_from: date
    decision_date_to: date
    delivery_date_from: date
    delivery_date_to: date
    default_decision_time: str
    decision_time_presets: list[DecisionTimePresetOut]
    data: DataInfo
