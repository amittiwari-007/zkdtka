from datetime import date, time

import pandas as pd
import pytest

from app.data.repository import clean_forecasts
from app.domain.selection import select_decision_forecasts
from tests.conftest import forecast_run

DELIVERY = date(2026, 1, 15)
DEADLINE = time(9, 20)  # -> 2026-01-14 09:20 UTC


def select(rows, delivery_dates=(DELIVERY,), decision_time=DEADLINE):
    forecasts, _, _ = clean_forecasts(rows)
    return select_decision_forecasts(forecasts, list(delivery_dates), decision_time)


def test_uses_latest_run_published_before_deadline():
    rows = forecast_run("2026-01-14T04:30", "2026-01-15T00:00", 24, 1000) + forecast_run(
        "2026-01-14T07:30", "2026-01-15T00:00", 24, 2000
    )
    result = select(rows)
    assert len(result) == 24
    assert (result["forecast_mw"] == 2000).all()
    assert (result["publish_time"] == pd.Timestamp("2026-01-14 07:30Z")).all()


def test_ignores_runs_published_after_deadline():
    rows = (
        forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 24, 2000)
        + forecast_run("2026-01-14T09:30", "2026-01-15T00:00", 24, 9999)  # too late
    )
    assert (select(rows)["forecast_mw"] == 2000).all()


def test_run_published_exactly_at_deadline_is_available():
    rows = forecast_run("2026-01-14T09:20", "2026-01-15T00:00", 24, 3000)
    assert (select(rows)["forecast_mw"] == 3000).all()


def test_falls_back_per_hour_when_latest_run_is_partial():
    rows = (
        forecast_run("2026-01-14T02:30", "2026-01-15T00:00", 24, 1000)
        + forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 12, 2000)  # only first 12 hours
    )
    result = select(rows).set_index("start_time")
    assert (result["forecast_mw"].iloc[:12] == 2000).all()
    assert (result["forecast_mw"].iloc[12:] == 1000).all()


def test_hours_without_any_eligible_forecast_are_kept_as_missing():
    rows = forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 20, 2000)
    result = select(rows)
    assert len(result) == 24
    assert result["forecast_mw"].isna().sum() == 4


def test_horizon_is_hours_between_publication_and_target():
    rows = forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 24, 2000)
    result = select(rows)
    assert result["horizon_h"].iloc[0] == pytest.approx(16.5)
    assert result["horizon_h"].iloc[-1] == pytest.approx(39.5)


def test_each_delivery_day_uses_its_own_deadline():
    rows = forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 48, 1000) + forecast_run(
        "2026-01-15T07:30", "2026-01-16T00:00", 24, 2000
    )
    result = select(rows, delivery_dates=(date(2026, 1, 15), date(2026, 1, 16)))
    by_day = result.groupby("delivery_date")["forecast_mw"].unique()
    assert list(by_day[date(2026, 1, 15)]) == [1000]
    assert list(by_day[date(2026, 1, 16)]) == [2000]


def test_summer_deadline_is_applied_in_uk_local_time():
    # 09:20 BST on 14 July = 08:20 UTC: the 08:00 UTC run is eligible, the 08:30 one is not.
    rows = forecast_run("2026-07-14T08:00", "2026-07-14T23:00", 24, 1000) + forecast_run(
        "2026-07-14T08:30", "2026-07-14T23:00", 24, 9999
    )
    result = select(rows, delivery_dates=(date(2026, 7, 15),))
    assert len(result) == 24
    assert (result["forecast_mw"] == 1000).all()


def test_no_delivery_dates_gives_empty_result():
    rows = forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 24, 2000)
    assert select(rows, delivery_dates=()).empty
