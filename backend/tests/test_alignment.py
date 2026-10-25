import pandas as pd

from app.data.repository import clean_actuals
from app.domain.alignment import hourly_actuals
from tests.conftest import actual_rows


def test_hourly_actual_is_mean_of_its_two_half_hours():
    rows = actual_rows("2026-01-15T00:00", 4, lambda at: 1000 if at.minute == 0 else 2000)
    actuals, _, _ = clean_actuals(rows)
    result = hourly_actuals(actuals)
    assert list(result["start_time"]) == [
        pd.Timestamp("2026-01-15 00:00Z"),
        pd.Timestamp("2026-01-15 01:00Z"),
    ]
    assert list(result["actual_mw"]) == [1500, 1500]


def test_hour_with_a_missing_half_hour_is_dropped():
    rows = actual_rows("2026-01-15T00:00", 4, 1000)
    del rows[3]  # 01:30 missing
    actuals, _, _ = clean_actuals(rows)
    result = hourly_actuals(actuals)
    assert list(result["start_time"]) == [pd.Timestamp("2026-01-15 00:00Z")]
