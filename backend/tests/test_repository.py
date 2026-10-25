from dataclasses import replace
from datetime import date

import pandas as pd
import pytest

from app.data import repository
from app.data.repository import (
    clean_actuals,
    clean_forecasts,
    count_missing_half_hours,
    load_dataset,
)
from app.data.snapshot import RawSnapshot, read_snapshot, write_snapshot
from app.elexon.client import ElexonError
from tests.conftest import actual_rows, forecast_run, make_settings, ts


def test_actuals_keep_latest_revision_of_each_half_hour():
    original = actual_rows("2026-01-15T00:00", 1, 1000)
    revised = actual_rows("2026-01-15T00:00", 1, 1100, publish_lag_min=90)
    frame, rejected, dupes = clean_actuals(original + revised)
    assert list(frame["generation_mw"]) == [1100]
    assert (rejected, dupes) == (0, 1)


def test_actuals_drop_other_fuel_types():
    rows = actual_rows("2026-01-15T00:00", 2, 1000)
    rows[1]["fuelType"] = "CCGT"
    frame, _, _ = clean_actuals(rows)
    assert len(frame) == 1


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda r: r.pop("generation"),
        lambda r: r.update(generation=None),
        lambda r: r.update(generation=-5),
        lambda r: r.update(startTime="2026-01-15T00:00:00"),  # no timezone
        lambda r: r.update(startTime="not a date"),
    ],
)
def test_malformed_actual_rows_are_rejected_and_counted(corrupt):
    rows = actual_rows("2026-01-15T00:00", 2, 1000)
    corrupt(rows[0])
    frame, rejected, _ = clean_actuals(rows)
    assert len(frame) == 1
    assert rejected == 1


def test_forecasts_dedupe_identical_run_points_and_reject_bad_rows():
    run = forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 3, 2000)
    bad = {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-15T05:00:00Z"}
    frame, rejected, dupes = clean_forecasts(run + run[:1] + [bad])
    assert len(frame) == 3
    assert (rejected, dupes) == (1, 1)
    assert str(frame["start_time"].dt.tz) == "UTC"


def test_count_missing_half_hours(tmp_path):
    settings = make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14))  # delivery 15 Jan
    rows = actual_rows("2026-01-15T00:00", 48, 1000)
    del rows[10:13]
    frame, _, _ = clean_actuals(rows)
    assert count_missing_half_hours(frame, settings) == 3


def _snapshot() -> RawSnapshot:
    return RawSnapshot(
        actual_rows=actual_rows("2026-01-15T00:00", 48, 1000),
        forecast_rows=forecast_run("2026-01-14T07:30", "2026-01-15T00:00", 24, 1200),
        fetched_at=ts("2026-02-02T00:00"),
        queries={"note": "test"},
    )


def test_snapshot_round_trip(tmp_path):
    write_snapshot(tmp_path, _snapshot())
    loaded = read_snapshot(tmp_path)
    assert loaded is not None
    assert loaded.actual_rows == _snapshot().actual_rows
    assert loaded.fetched_at == ts("2026-02-02T00:00")


def test_read_snapshot_returns_none_when_files_missing(tmp_path):
    assert read_snapshot(tmp_path) is None


def test_snapshot_mode_reads_bundled_files(tmp_path, monkeypatch):
    settings = make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14))
    write_snapshot(settings.snapshot_dir, _snapshot())
    monkeypatch.setattr(repository, "_fetch_live", _fail)
    dataset = load_dataset(settings)
    assert dataset.source == "snapshot"
    assert len(dataset.actuals) == 48


def test_snapshot_mode_falls_back_to_live_when_no_snapshot(tmp_path, monkeypatch):
    settings = make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14))
    monkeypatch.setattr(repository, "_fetch_live", lambda _: _snapshot())
    assert load_dataset(settings).source == "live"


def test_live_mode_falls_back_to_snapshot_when_elexon_fails(tmp_path, monkeypatch):
    settings = replace(
        make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14)), data_mode="live"
    )
    write_snapshot(settings.snapshot_dir, _snapshot())
    monkeypatch.setattr(repository, "_fetch_live", _fail)
    assert load_dataset(settings).source == "snapshot"


def test_live_mode_raises_when_elexon_fails_and_no_snapshot(tmp_path, monkeypatch):
    settings = replace(
        make_settings(tmp_path, date(2026, 1, 14), date(2026, 1, 14)), data_mode="live"
    )
    monkeypatch.setattr(repository, "_fetch_live", _fail)
    with pytest.raises(ElexonError):
        load_dataset(settings)


def test_fetch_window_covers_decisions_and_deliveries(tmp_path):
    settings = make_settings(tmp_path, date(2026, 1, 1), date(2026, 1, 31))
    window = repository.fetch_window(settings)
    assert window.actual_settlement_from == date(2026, 1, 1)
    assert window.actual_settlement_to == date(2026, 2, 2)
    assert window.forecast_publish_from == pd.Timestamp("2025-12-29 00:00Z")
    assert window.forecast_publish_to == pd.Timestamp("2026-02-02 00:00Z")


def _fail(_settings):
    raise ElexonError("boom")
