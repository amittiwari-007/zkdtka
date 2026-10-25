"""Builds the views the API serves, on top of selection, alignment and metrics.

The central object is the *evaluation frame* for a decision time: one row per target hour of
every in-scope delivery day, holding the forecast available at the deadline, the hourly actual
and the error. It is computed once per decision time and cached.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import date, time, timedelta

import pandas as pd

from app.config import (
    COMPARISON_DECISION_TIMES,
    DECISION_TIME_PRESETS,
    UK_TZ,
    Settings,
)
from app.data.repository import WindDataset
from app.domain.alignment import hourly_actuals
from app.domain.calendar import (
    date_span,
    decision_deadline,
    delivery_window,
    hours_between,
    to_uk,
)
from app.domain.metrics import error_summary, histogram, planning_margins, rounded
from app.domain.models import (
    AccuracyReport,
    Coverage,
    DailyStat,
    DataInfo,
    DayHour,
    DaySummary,
    DayView,
    DecisionTimePresetOut,
    DecisionTimeStat,
    ForecastLevelStat,
    ForecastRun,
    HalfHourActual,
    HorizonStat,
    HourOfDayStat,
    Meta,
    RunPoint,
    ScatterPoint,
)
from app.domain.selection import select_decision_forecasts

HORIZON_BUCKET_H = 6
MAX_HORIZON_H = 48
FORECAST_LEVEL_BUCKET_MW = 2500
BAND_LOW_Q, BAND_HIGH_Q = 0.1, 0.9
DAY_VIEW_MARGIN_CONFIDENCE = 0.9
# The day view also shows runs published up to this long before the deadline.
RUN_HISTORY = timedelta(hours=24)


def format_hhmm(value: time) -> str:
    return value.strftime("%H:%M")


class WindAnalysis:
    def __init__(self, dataset: WindDataset, settings: Settings) -> None:
        self.dataset = dataset
        self.settings = settings
        self.delivery_dates = date_span(settings.delivery_date_from, settings.delivery_date_to)
        self._hourly_actuals = hourly_actuals(dataset.actuals)
        self._frames: dict[time, pd.DataFrame] = {}
        self._all_runs = self._build_all_runs_frame()

    # ----------------------------------------------------------------- evaluation frame

    def evaluation_frame(self, decision_time: time) -> pd.DataFrame:
        frame = self._frames.get(decision_time)
        if frame is None:
            selected = select_decision_forecasts(
                self.dataset.forecasts, self.delivery_dates, decision_time
            )
            frame = selected.merge(self._hourly_actuals, on="start_time", how="left")
            frame["error_mw"] = frame["forecast_mw"] - frame["actual_mw"]
            frame["local_hour"] = to_uk(frame["start_time"]).dt.hour
            self._frames[decision_time] = frame
        return frame

    def _slice(self, decision_time: time, date_from: date, date_to: date) -> pd.DataFrame:
        frame = self.evaluation_frame(decision_time)
        in_range = (frame["delivery_date"] >= date_from) & (frame["delivery_date"] <= date_to)
        return frame[in_range]

    def _build_all_runs_frame(self) -> pd.DataFrame:
        """Every forecast point (all runs, not just the one used) joined to its actual.

        Used for the lead-time curve: at a fixed decision time, lead time is tied to the hour of
        day, so only the full set of runs isolates the effect of forecasting further ahead.
        """
        frame = self.dataset.forecasts.merge(self._hourly_actuals, on="start_time", how="inner")
        frame["horizon_h"] = hours_between(frame["publish_time"], frame["start_time"])
        frame["delivery_date"] = to_uk(frame["start_time"]).dt.date
        frame["error_mw"] = frame["generation_mw"] - frame["actual_mw"]
        return frame[(frame["horizon_h"] >= 0) & (frame["horizon_h"] < MAX_HORIZON_H)]

    # ----------------------------------------------------------------- accuracy

    def accuracy_report(
        self, decision_time: time, date_from: date, date_to: date
    ) -> AccuracyReport:
        frame = self._slice(decision_time, date_from, date_to)
        evaluated = frame.dropna(subset=["forecast_mw", "actual_mw"])
        errors = evaluated["error_mw"]
        return AccuracyReport(
            decision_time=format_hhmm(decision_time),
            delivery_date_from=date_from,
            delivery_date_to=date_to,
            summary=error_summary(frame["forecast_mw"], frame["actual_mw"]),
            coverage=Coverage(
                target_hours=len(frame),
                hours_with_forecast=int(frame["forecast_mw"].notna().sum()),
                hours_with_actual=int(frame["actual_mw"].notna().sum()),
                hours_evaluated=len(evaluated),
            ),
            planning_margins=planning_margins(errors),
            by_hour_of_day=_by_hour_of_day(evaluated),
            by_horizon=self._horizon_curve(date_from, date_to),
            by_forecast_level=_by_forecast_level(evaluated),
            by_day=_by_day(evaluated),
            histogram=histogram(errors),
            scatter=[
                ScatterPoint(
                    start_time=row.start_time,
                    forecast_mw=float(row.forecast_mw),
                    actual_mw=round(float(row.actual_mw), 1),
                )
                for row in evaluated.itertuples()
            ],
            decision_time_comparison=self.decision_time_comparison(
                decision_time, date_from, date_to
            ),
        )

    def _horizon_curve(self, date_from: date, date_to: date) -> list[HorizonStat]:
        runs = self._all_runs
        in_range = runs[(runs["delivery_date"] >= date_from) & (runs["delivery_date"] <= date_to)]
        return _by_horizon(in_range)

    def decision_time_comparison(
        self, selected: time, date_from: date, date_to: date
    ) -> list[DecisionTimeStat]:
        """Accuracy if the decision were made at other times on D-1 ("value of waiting")."""
        labels = {preset.time: preset.label for preset in DECISION_TIME_PRESETS}
        stats = []
        for decision_time in sorted({*COMPARISON_DECISION_TIMES, selected}):
            frame = self._slice(decision_time, date_from, date_to)
            summary = error_summary(frame["forecast_mw"], frame["actual_mw"])
            evaluated = frame.dropna(subset=["forecast_mw", "actual_mw"])
            stats.append(
                DecisionTimeStat(
                    decision_time=format_hhmm(decision_time),
                    label=labels.get(decision_time),
                    n=summary.n,
                    mae_mw=summary.mae_mw,
                    rmse_mw=summary.rmse_mw,
                    bias_mw=summary.bias_mw,
                    p90_abs_error_mw=summary.p90_abs_error_mw,
                    median_horizon_h=rounded(evaluated["horizon_h"].median()),
                )
            )
        return stats

    # ----------------------------------------------------------------- single day

    def day_view(self, delivery_date: date, decision_time: time) -> DayView:
        frame = self.evaluation_frame(decision_time)
        day = frame[frame["delivery_date"] == delivery_date]
        # The error band comes from the *other* days, so the day being inspected never informs
        # its own band.
        other_errors = frame.loc[frame["delivery_date"] != delivery_date, "error_mw"].dropna()
        band_low_error = other_errors.quantile(BAND_LOW_Q) if len(other_errors) else math.nan
        band_high_error = other_errors.quantile(BAND_HIGH_Q) if len(other_errors) else math.nan
        margin = (
            other_errors.quantile(DAY_VIEW_MARGIN_CONFIDENCE) if len(other_errors) else math.nan
        )

        deadline = decision_deadline(delivery_date, decision_time)
        window_start, window_end = delivery_window(delivery_date)
        runs_used = sorted(day["publish_time"].dropna().unique())

        hourly = [
            DayHour(
                start_time=row.start_time,
                forecast_mw=rounded(row.forecast_mw),
                publish_time=None if pd.isna(row.publish_time) else row.publish_time,
                horizon_h=rounded(row.horizon_h),
                actual_mw=rounded(row.actual_mw),
                error_mw=rounded(row.error_mw),
                likely_low_mw=rounded(max(0.0, row.forecast_mw - band_high_error)),
                likely_high_mw=rounded(row.forecast_mw - band_low_error),
            )
            for row in day.itertuples()
        ]

        actuals = self.dataset.actuals
        day_actuals = actuals[
            (actuals["start_time"] >= window_start) & (actuals["start_time"] < window_end)
        ]
        day_summary = error_summary(day["forecast_mw"], day["actual_mw"])
        return DayView(
            delivery_date=delivery_date,
            decision_date=delivery_date - timedelta(days=1),
            decision_time=format_hhmm(decision_time),
            deadline_utc=deadline,
            runs_used=[pd.Timestamp(ts) for ts in runs_used],
            band_confidence=BAND_HIGH_Q - BAND_LOW_Q,
            summary=DaySummary(
                target_hours=len(day),
                hours_with_forecast=int(day["forecast_mw"].notna().sum()),
                forecast_energy_mwh=rounded(day["forecast_mw"].sum(min_count=1), 0),
                actual_energy_mwh=rounded(day_actuals["generation_mw"].sum(min_count=1) * 0.5, 0),
                forecast_peak_mw=rounded(day["forecast_mw"].max()),
                forecast_min_mw=rounded(day["forecast_mw"].min()),
                planning_margin_mw=rounded(margin),
                mae_mw=day_summary.mae_mw,
                bias_mw=day_summary.bias_mw,
            ),
            hourly=hourly,
            actuals=[
                HalfHourActual(start_time=row.start_time, actual_mw=float(row.generation_mw))
                for row in day_actuals.itertuples()
            ],
            runs=self._runs_around(deadline, window_start, window_end, set(runs_used)),
        )

    def _runs_around(
        self,
        deadline: pd.Timestamp,
        window_start: pd.Timestamp,
        window_end: pd.Timestamp,
        used: set[pd.Timestamp],
    ) -> list[ForecastRun]:
        """Runs published from RUN_HISTORY before the deadline until delivery starts, clipped
        to the delivery day: shows how the forecast evolved, and what arrived too late."""
        forecasts = self.dataset.forecasts
        relevant = forecasts[
            (forecasts["publish_time"] >= deadline - RUN_HISTORY)
            & (forecasts["publish_time"] < window_start)
            & (forecasts["start_time"] >= window_start)
            & (forecasts["start_time"] < window_end)
        ]
        return [
            ForecastRun(
                publish_time=publish_time,
                available_at_decision=bool(publish_time <= deadline),
                used=publish_time in used,
                points=[
                    RunPoint(start_time=row.start_time, forecast_mw=float(row.generation_mw))
                    for row in run.itertuples()
                ],
            )
            for publish_time, run in relevant.groupby("publish_time")
        ]

    # ----------------------------------------------------------------- metadata

    def meta(self) -> Meta:
        settings, quality = self.settings, self.dataset.quality
        return Meta(
            timezone=str(UK_TZ),
            decision_date_from=settings.decision_date_from,
            decision_date_to=settings.decision_date_to,
            delivery_date_from=settings.delivery_date_from,
            delivery_date_to=settings.delivery_date_to,
            default_decision_time=format_hhmm(settings.default_decision_time),
            decision_time_presets=[
                DecisionTimePresetOut(
                    id=p.id, label=p.label, time=format_hhmm(p.time), description=p.description
                )
                for p in DECISION_TIME_PRESETS
            ],
            data=DataInfo(
                source=self.dataset.source,
                fetched_at=self.dataset.fetched_at,
                actual_rows_received=quality.actual_rows_received,
                actual_rows_rejected=quality.actual_rows_rejected,
                actual_duplicates_removed=quality.actual_duplicates_removed,
                actual_missing_half_hours=quality.actual_missing_half_hours,
                forecast_rows_received=quality.forecast_rows_received,
                forecast_rows_rejected=quality.forecast_rows_rejected,
                forecast_duplicates_removed=quality.forecast_duplicates_removed,
                forecast_runs=quality.forecast_runs,
                forecast_publish_schedule_utc=_publish_schedule(self.dataset.forecasts),
            ),
        )


# --------------------------------------------------------------------- breakdown helpers


def _by_hour_of_day(evaluated: pd.DataFrame) -> list[HourOfDayStat]:
    return [
        HourOfDayStat(
            hour=int(hour),
            n=len(group),
            mae_mw=rounded(group["error_mw"].abs().mean()),
            bias_mw=rounded(group["error_mw"].mean()),
            p10_error_mw=rounded(group["error_mw"].quantile(0.1)),
            p90_error_mw=rounded(group["error_mw"].quantile(0.9)),
        )
        for hour, group in evaluated.groupby("local_hour")
    ]


def _by_horizon(evaluated: pd.DataFrame) -> list[HorizonStat]:
    bucket = (evaluated["horizon_h"] // HORIZON_BUCKET_H * HORIZON_BUCKET_H).astype(int)
    return [
        HorizonStat(
            horizon_from_h=int(start),
            horizon_to_h=int(start) + HORIZON_BUCKET_H,
            n=len(group),
            mae_mw=rounded(group["error_mw"].abs().mean()),
            rmse_mw=rounded(math.sqrt(float((group["error_mw"] ** 2).mean()))),
            bias_mw=rounded(group["error_mw"].mean()),
        )
        for start, group in evaluated.groupby(bucket)
    ]


def _by_forecast_level(evaluated: pd.DataFrame) -> list[ForecastLevelStat]:
    bucket = (
        evaluated["forecast_mw"] // FORECAST_LEVEL_BUCKET_MW * FORECAST_LEVEL_BUCKET_MW
    ).astype(int)
    return [
        ForecastLevelStat(
            level_from_mw=int(start),
            level_to_mw=int(start) + FORECAST_LEVEL_BUCKET_MW,
            n=len(group),
            mae_mw=rounded(group["error_mw"].abs().mean()),
            bias_mw=rounded(group["error_mw"].mean()),
        )
        for start, group in evaluated.groupby(bucket)
    ]


def _by_day(evaluated: pd.DataFrame) -> list[DailyStat]:
    return [
        DailyStat(
            delivery_date=day,
            n=len(group),
            mae_mw=rounded(group["error_mw"].abs().mean()),
            bias_mw=rounded(group["error_mw"].mean()),
            max_abs_error_mw=rounded(group["error_mw"].abs().max()),
            # Hourly MW summed over hours = MWh.
            forecast_energy_mwh=round(float(group["forecast_mw"].sum()), 0),
            actual_energy_mwh=round(float(group["actual_mw"].sum()), 0),
        )
        for day, group in evaluated.groupby("delivery_date")
    ]


def _publish_schedule(forecasts: pd.DataFrame) -> list[str]:
    """Regular run times: those seen on at least half as many days as the most common one."""
    runs = forecasts["publish_time"].drop_duplicates()
    counts = Counter(runs.dt.strftime("%H:%M"))
    if not counts:
        return []
    threshold = max(counts.values()) / 2
    return sorted(slot for slot, count in counts.items() if count >= threshold)
