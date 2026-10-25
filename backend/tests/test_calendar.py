from datetime import date, time

import pandas as pd

from app.domain.calendar import date_span, decision_deadline, delivery_window, hourly_targets


def test_deadline_in_winter_is_uk_time_equal_to_utc():
    assert decision_deadline(date(2026, 1, 15), time(9, 20)) == pd.Timestamp("2026-01-14 09:20Z")


def test_deadline_in_summer_accounts_for_bst():
    assert decision_deadline(date(2026, 7, 15), time(9, 20)) == pd.Timestamp("2026-07-14 08:20Z")


def test_delivery_window_in_summer_starts_at_uk_midnight():
    start, end = delivery_window(date(2026, 7, 15))
    assert start == pd.Timestamp("2026-07-14 23:00Z")
    assert end == pd.Timestamp("2026-07-15 23:00Z")


def test_normal_day_has_24_hours():
    assert len(hourly_targets(date(2026, 1, 15))) == 24


def test_clock_change_days_have_23_and_25_hours():
    assert len(hourly_targets(date(2026, 3, 29))) == 23  # clocks go forward
    assert len(hourly_targets(date(2026, 10, 25))) == 25  # clocks go back


def test_date_span_is_inclusive():
    assert date_span(date(2026, 1, 30), date(2026, 2, 1)) == [
        date(2026, 1, 30),
        date(2026, 1, 31),
        date(2026, 2, 1),
    ]
