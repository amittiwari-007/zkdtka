"""Shared helpers to build small, readable synthetic Elexon payloads."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.config import Settings, get_settings
from app.data.repository import WindDataset, build_dataset
from app.data.snapshot import RawSnapshot

Value = float | Callable[[datetime], float]


def ts(value: str) -> datetime:
    """'2026-01-14T07:30' -> aware UTC datetime."""
    return datetime.fromisoformat(value).replace(tzinfo=UTC)


def iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def _value(value: Value, at: datetime) -> float:
    return value(at) if callable(value) else value


def forecast_run(publish: str, first_target: str, hours: int, mw: Value) -> list[dict[str, Any]]:
    """One WINDFOR run: `hours` hourly points starting at `first_target`."""
    start = ts(first_target)
    return [
        {
            "dataset": "WINDFOR",
            "publishTime": iso(ts(publish)),
            "startTime": iso(start + timedelta(hours=h)),
            "generation": _value(mw, start + timedelta(hours=h)),
        }
        for h in range(hours)
    ]


def actual_rows(
    first: str, half_hours: int, mw: Value, publish_lag_min: int = 30
) -> list[dict[str, Any]]:
    start = ts(first)
    rows = []
    for i in range(half_hours):
        at = start + timedelta(minutes=30 * i)
        rows.append(
            {
                "dataset": "FUELHH",
                "publishTime": iso(at + timedelta(minutes=publish_lag_min)),
                "startTime": iso(at),
                "settlementDate": at.date().isoformat(),
                "settlementPeriod": i % 48 + 1,
                "fuelType": "WIND",
                "generation": _value(mw, at),
            }
        )
    return rows


def make_settings(tmp_path: Path, first_decision: date, last_decision: date) -> Settings:
    return replace(
        Settings(),
        decision_date_from=first_decision,
        decision_date_to=last_decision,
        snapshot_dir=tmp_path / "snapshot",
    )


def make_dataset(
    settings: Settings, actuals: list[dict[str, Any]], forecasts: list[dict[str, Any]]
) -> WindDataset:
    snapshot = RawSnapshot(
        actual_rows=actuals, forecast_rows=forecasts, fetched_at=ts("2026-02-02T00:00"), queries={}
    )
    return build_dataset(snapshot, source="snapshot", settings=settings)


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
