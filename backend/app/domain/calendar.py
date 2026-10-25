"""Market calendar: delivery days, decision deadlines and time-zone handling.

A delivery day is a UK local calendar day (00:00 to 24:00 Europe/London), i.e. 48 settlement
periods normally, 46 or 50 on clock-change days. The purchase decision for delivery day D is
made on D-1 at a configurable UK local time (e.g. the 09:20 EPEX gate closure).
All returned timestamps are UTC.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

import pandas as pd

from app.config import UK_TZ

HOUR = pd.Timedelta(hours=1)


def delivery_window(delivery_date: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a UK delivery day, in UTC."""
    start = datetime.combine(delivery_date, time(0), tzinfo=UK_TZ)
    end = datetime.combine(delivery_date + timedelta(days=1), time(0), tzinfo=UK_TZ)
    return pd.Timestamp(start).tz_convert(UTC), pd.Timestamp(end).tz_convert(UTC)


def decision_deadline(delivery_date: date, decision_time: time) -> pd.Timestamp:
    """The moment (UTC) the purchase decision for `delivery_date` must be made: D-1 at
    `decision_time` UK local time."""
    local = datetime.combine(delivery_date - timedelta(days=1), decision_time, tzinfo=UK_TZ)
    return pd.Timestamp(local).tz_convert(UTC)


def hourly_targets(delivery_date: date) -> pd.DatetimeIndex:
    """Start of every hour in the delivery day (23, 24 or 25 of them), in UTC."""
    start, end = delivery_window(delivery_date)
    return pd.date_range(start, end, freq=HOUR, inclusive="left")


def date_span(first: date, last: date) -> list[date]:
    """Every date from `first` to `last`, inclusive."""
    return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]


def to_uk(values: pd.Series) -> pd.Series:
    return values.dt.tz_convert(UK_TZ)


def hours_between(earlier: pd.Series, later: pd.Series) -> pd.Series:
    """Elementwise (later - earlier) in hours; NaN where either side is missing."""
    return (later - earlier).dt.total_seconds() / 3600
