"""The core business rule: which forecast was actually available when the decision was made.

For every target hour t of delivery day D we use the forecast with the latest `publish_time`
that is at or before the decision deadline of D. Forecasts published later are ignored; using
them would leak information the buyer did not have (look-ahead bias).

Selecting per target hour (rather than "the latest run") means that if the latest run is missing
or only covers part of the day, each hour falls back to the newest earlier run that covers it.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, time

import pandas as pd

from app.domain.calendar import decision_deadline, hourly_targets, hours_between

SELECTION_COLUMNS = [
    "start_time",
    "delivery_date",
    "deadline",
    "publish_time",
    "forecast_mw",
    "horizon_h",
]


def build_targets(delivery_dates: Sequence[date], decision_time: time) -> pd.DataFrame:
    """One row per target hour: start_time, delivery_date, deadline."""
    frames = [
        pd.DataFrame(
            {
                "start_time": hourly_targets(day),
                "delivery_date": day,
                "deadline": decision_deadline(day, decision_time),
            }
        )
        for day in delivery_dates
    ]
    if not frames:
        return pd.DataFrame(
            {
                "start_time": pd.Series(dtype="datetime64[ns, UTC]"),
                "delivery_date": pd.Series(dtype=object),
                "deadline": pd.Series(dtype="datetime64[ns, UTC]"),
            }
        )
    return pd.concat(frames, ignore_index=True)


def select_decision_forecasts(
    forecasts: pd.DataFrame, delivery_dates: Sequence[date], decision_time: time
) -> pd.DataFrame:
    """Forecast available at decision time for every target hour of `delivery_dates`.

    Hours with no eligible forecast are kept with NaN values so coverage can be reported.
    `horizon_h` is how far ahead of the target hour the chosen forecast was published.
    """
    targets = build_targets(delivery_dates, decision_time)
    candidates = targets.merge(forecasts, on="start_time", how="inner")
    candidates = candidates[candidates["publish_time"] <= candidates["deadline"]]
    latest_idx = candidates.groupby("start_time")["publish_time"].idxmax()
    latest = candidates.loc[latest_idx, ["start_time", "publish_time", "generation_mw"]]

    selected = targets.merge(latest, on="start_time", how="left").rename(
        columns={"generation_mw": "forecast_mw"}
    )
    selected["horizon_h"] = hours_between(selected["publish_time"], selected["start_time"])
    return selected[SELECTION_COLUMNS]
