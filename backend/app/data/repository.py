"""Loads, validates and cleans the wind data into tidy DataFrames.

All timestamps are UTC (tz-aware). Two tables come out:

* actuals   - one row per half-hour:            start_time, generation_mw
* forecasts - one row per (run, target hour):   publish_time, start_time, generation_mw
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

import pandas as pd
from pydantic import ValidationError

from app.config import UK_TZ, Settings
from app.data.snapshot import RawSnapshot, read_snapshot
from app.elexon.client import ElexonClient, ElexonError, RawRow
from app.elexon.schemas import ActualGenerationRow, WindForecastRow

logger = logging.getLogger(__name__)

HALF_HOUR = pd.Timedelta(minutes=30)

# The longest WINDFOR horizon is under 3 days, so runs older than this can never be selected.
FORECAST_LOOKBACK = timedelta(days=3)


@dataclass(frozen=True)
class DataQuality:
    actual_rows_received: int
    actual_rows_rejected: int
    actual_duplicates_removed: int
    actual_missing_half_hours: int
    forecast_rows_received: int
    forecast_rows_rejected: int
    forecast_duplicates_removed: int
    forecast_runs: int


@dataclass(frozen=True)
class WindDataset:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    source: Literal["snapshot", "live"]
    fetched_at: datetime
    quality: DataQuality


@dataclass(frozen=True)
class FetchWindow:
    actual_settlement_from: date
    actual_settlement_to: date
    forecast_publish_from: datetime
    forecast_publish_to: datetime


def fetch_window(settings: Settings) -> FetchWindow:
    """The raw data needed to evaluate every in-scope purchase decision (with a day of margin)."""
    first_decision = datetime.combine(settings.decision_date_from, time(0), tzinfo=UK_TZ)
    last_delivery_end = datetime.combine(
        settings.delivery_date_to, time(0), tzinfo=UK_TZ
    ) + timedelta(days=1)
    return FetchWindow(
        actual_settlement_from=settings.delivery_date_from - timedelta(days=1),
        actual_settlement_to=settings.delivery_date_to + timedelta(days=1),
        forecast_publish_from=(first_decision - FORECAST_LOOKBACK).astimezone(UTC),
        forecast_publish_to=last_delivery_end.astimezone(UTC),
    )


def fetch_raw(settings: Settings, client: ElexonClient) -> RawSnapshot:
    window = fetch_window(settings)
    actual_rows = client.fetch_wind_actuals(
        window.actual_settlement_from, window.actual_settlement_to
    )
    forecast_rows = client.fetch_wind_forecasts(
        window.forecast_publish_from, window.forecast_publish_to
    )
    return RawSnapshot(
        actual_rows=actual_rows,
        forecast_rows=forecast_rows,
        fetched_at=datetime.now(UTC),
        queries={
            "FUELHH": {
                "settlementDateFrom": window.actual_settlement_from.isoformat(),
                "settlementDateTo": window.actual_settlement_to.isoformat(),
                "fuelType": "WIND",
            },
            "WINDFOR": {
                "publishDateTimeFrom": window.forecast_publish_from.isoformat(),
                "publishDateTimeTo": window.forecast_publish_to.isoformat(),
            },
        },
    )


def load_dataset(settings: Settings) -> WindDataset:
    """Load data according to `settings.data_mode`, falling back to the other source on failure."""
    if settings.data_mode == "snapshot":
        snapshot = read_snapshot(settings.snapshot_dir)
        if snapshot is not None:
            return build_dataset(snapshot, source="snapshot", settings=settings)
        logger.warning("No snapshot in %s; fetching live from Elexon", settings.snapshot_dir)
        return build_dataset(_fetch_live(settings), source="live", settings=settings)

    try:
        return build_dataset(_fetch_live(settings), source="live", settings=settings)
    except ElexonError:
        snapshot = read_snapshot(settings.snapshot_dir)
        if snapshot is None:
            raise
        logger.exception("Live fetch failed; serving bundled snapshot instead")
        return build_dataset(snapshot, source="snapshot", settings=settings)


def _fetch_live(settings: Settings) -> RawSnapshot:
    with ElexonClient(
        settings.elexon_base_url,
        timeout_s=settings.elexon_timeout_s,
        max_retries=settings.elexon_max_retries,
    ) as client:
        return fetch_raw(settings, client)


def build_dataset(
    snapshot: RawSnapshot, *, source: Literal["snapshot", "live"], settings: Settings
) -> WindDataset:
    actuals, actual_rejected, actual_dupes = clean_actuals(snapshot.actual_rows)
    forecasts, forecast_rejected, forecast_dupes = clean_forecasts(snapshot.forecast_rows)
    quality = DataQuality(
        actual_rows_received=len(snapshot.actual_rows),
        actual_rows_rejected=actual_rejected,
        actual_duplicates_removed=actual_dupes,
        actual_missing_half_hours=count_missing_half_hours(actuals, settings),
        forecast_rows_received=len(snapshot.forecast_rows),
        forecast_rows_rejected=forecast_rejected,
        forecast_duplicates_removed=forecast_dupes,
        forecast_runs=int(forecasts["publish_time"].nunique()),
    )
    if actual_rejected or forecast_rejected:
        logger.warning(
            "Rejected malformed rows: %d actual, %d forecast", actual_rejected, forecast_rejected
        )
    return WindDataset(
        actuals=actuals,
        forecasts=forecasts,
        source=source,
        fetched_at=snapshot.fetched_at,
        quality=quality,
    )


def clean_actuals(rows: list[RawRow]) -> tuple[pd.DataFrame, int, int]:
    """Validate FUELHH rows, keep WIND only, and keep the latest revision of each half-hour.

    Returns (frame, rejected_count, duplicates_removed).
    """
    valid: list[ActualGenerationRow] = []
    rejected = 0
    for row in rows:
        try:
            parsed = ActualGenerationRow.model_validate(row)
        except ValidationError:
            rejected += 1
            continue
        if parsed.fuel_type == "WIND":
            valid.append(parsed)
    frame = pd.DataFrame(
        {
            "publish_time": [r.publish_time for r in valid],
            "start_time": [r.start_time for r in valid],
            "generation_mw": [r.generation for r in valid],
        }
    )
    frame = _to_utc(frame, ["publish_time", "start_time"])
    before = len(frame)
    frame = (
        frame.sort_values(["start_time", "publish_time"])
        .drop_duplicates("start_time", keep="last")
        .reset_index(drop=True)
    )
    return frame[["start_time", "generation_mw"]], rejected, before - len(frame)


def clean_forecasts(rows: list[RawRow]) -> tuple[pd.DataFrame, int, int]:
    """Validate WINDFOR rows and drop exact (run, target) duplicates (e.g. from chunk overlaps).

    Returns (frame, rejected_count, duplicates_removed).
    """
    valid: list[WindForecastRow] = []
    rejected = 0
    for row in rows:
        try:
            valid.append(WindForecastRow.model_validate(row))
        except ValidationError:
            rejected += 1
    frame = pd.DataFrame(
        {
            "publish_time": [r.publish_time for r in valid],
            "start_time": [r.start_time for r in valid],
            "generation_mw": [r.generation for r in valid],
        }
    )
    frame = _to_utc(frame, ["publish_time", "start_time"])
    before = len(frame)
    frame = (
        frame.drop_duplicates(["publish_time", "start_time"], keep="last")
        .sort_values(["start_time", "publish_time"])
        .reset_index(drop=True)
    )
    return frame, rejected, before - len(frame)


def count_missing_half_hours(actuals: pd.DataFrame, settings: Settings) -> int:
    start = pd.Timestamp(datetime.combine(settings.delivery_date_from, time(0), tzinfo=UK_TZ))
    end = pd.Timestamp(
        datetime.combine(settings.delivery_date_to, time(0), tzinfo=UK_TZ) + timedelta(days=1)
    )
    expected = pd.date_range(start, end, freq=HALF_HOUR, inclusive="left").tz_convert(UTC)
    present = pd.DatetimeIndex(actuals["start_time"])
    return int((~expected.isin(present)).sum())


def _to_utc(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    for column in columns:
        frame[column] = pd.to_datetime(frame[column], utc=True)
    return frame
