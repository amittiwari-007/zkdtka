"""Put actuals on the forecast's time grid.

Actuals (FUELHH) are half-hourly; forecasts (WINDFOR) are hourly. Both `startTime`s mark the
start of their period, so the actual for forecast hour t is the mean of the half-hours starting
at t and t+30min (MW are average power, so the mean is the hourly average). An hour with a
missing half-hour has no reliable actual and is dropped rather than half-filled.
"""

from __future__ import annotations

import pandas as pd

from app.domain.calendar import HOUR

HALF_HOURS_PER_HOUR = 2


def hourly_actuals(actuals: pd.DataFrame) -> pd.DataFrame:
    """Columns: start_time (UTC hour), actual_mw. Only hours with both half-hours present."""
    hour = actuals["start_time"].dt.floor(HOUR).rename("start_time")
    grouped = actuals.groupby(hour)["generation_mw"].agg(["mean", "count"])
    complete = grouped[grouped["count"] == HALF_HOURS_PER_HOUR]
    return complete["mean"].rename("actual_mw").reset_index()
