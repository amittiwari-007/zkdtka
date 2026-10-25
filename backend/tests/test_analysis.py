from datetime import date, time

import pandas as pd
import pytest

from app.domain.analysis import WindAnalysis
from tests.conftest import actual_rows, forecast_run, make_dataset, make_settings

# Two delivery days: 15 and 16 Jan (decisions on 14 and 15 Jan).


@pytest.fixture
def analysis(tmp_path) -> WindAnalysis:
    settings = make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 15))
    actuals = actual_rows("2026-01-15T00:00", 96, 1000)
    forecasts = (
        forecast_run("2026-01-14T04:30", "2026-01-15T00:00", 48, 1100)
        + forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 48, 1200)  # used for 15 Jan
        + forecast_run("2026-01-14T09:30", "2026-01-15T00:00", 48, 5000)  # too late for 15 Jan
        + forecast_run("2026-01-15T07:30", "2026-01-16T00:00", 24, 1400)  # used for 16 Jan
    )
    return WindAnalysis(make_dataset(settings, actuals, forecasts), settings)


def test_accuracy_uses_only_forecasts_available_at_decision(analysis):
    report = analysis.accuracy_report(time(9, 20), date(2026, 1, 15), date(2026, 1, 16))
    # 15 Jan: +200 for 24h, 16 Jan: +400 for 24h
    assert report.summary.n == 48
    assert report.summary.bias_mw == pytest.approx(300.0)
    assert report.coverage.target_hours == 48
    assert report.coverage.hours_evaluated == 48
    assert [d.bias_mw for d in report.by_day] == [200.0, 400.0]


def test_later_decision_time_picks_up_later_run(analysis):
    report = analysis.accuracy_report(time(10, 0), date(2026, 1, 15), date(2026, 1, 15))
    assert report.summary.bias_mw == pytest.approx(4000.0)


def test_decision_time_comparison_includes_presets_and_selected_time(analysis):
    report = analysis.accuracy_report(time(8, 0), date(2026, 1, 15), date(2026, 1, 16))
    times = [row.decision_time for row in report.decision_time_comparison]
    assert "08:00" in times
    assert "09:20" in times
    assert times == sorted(times)
    labels = {row.decision_time: row.label for row in report.decision_time_comparison}
    assert labels["09:20"] == "EPEX day-ahead auction"


def test_day_view_flags_runs_by_availability(analysis):
    view = analysis.day_view(date(2026, 1, 15), time(9, 20))
    assert view.deadline_utc == pd.Timestamp("2026-01-14 09:20Z")
    assert view.runs_used == [pd.Timestamp("2026-01-14 07:30Z")]
    flags = {str(r.publish_time): (r.available_at_decision, r.used) for r in view.runs}
    assert flags == {
        "2026-01-14 04:30:00+00:00": (True, False),
        "2026-01-14 07:30:00+00:00": (True, True),
        "2026-01-14 09:30:00+00:00": (False, False),
    }
    assert len(view.hourly) == 24
    assert len(view.actuals) == 48
    assert view.summary.forecast_energy_mwh == 24 * 1200
    assert view.summary.actual_energy_mwh == 24 * 1000


def test_day_view_band_comes_from_other_days_only(analysis):
    # The only other day (16 Jan) has a constant +400 error, so the band collapses onto
    # forecast - 400, regardless of 15 Jan's own +200 error.
    view = analysis.day_view(date(2026, 1, 15), time(9, 20))
    first = view.hourly[0]
    assert first.likely_low_mw == pytest.approx(800.0)
    assert first.likely_high_mw == pytest.approx(800.0)
    assert view.summary.planning_margin_mw == pytest.approx(400.0)


def test_day_without_forecasts_reports_gaps_instead_of_failing(tmp_path):
    settings = make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14))
    dataset = make_dataset(settings, actual_rows("2026-01-15T00:00", 48, 1000), [])
    view = WindAnalysis(dataset, settings).day_view(date(2026, 1, 15), time(9, 20))
    assert view.summary.hours_with_forecast == 0
    assert view.summary.forecast_energy_mwh is None
    assert all(h.forecast_mw is None for h in view.hourly)


def test_meta_reports_regular_publish_schedule(analysis):
    meta = analysis.meta()
    assert meta.delivery_date_from == date(2026, 1, 15)
    assert meta.default_decision_time == "09:20"
    assert meta.data.forecast_runs == 4
