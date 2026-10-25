"""Application settings, read once from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, time
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parent.parent

UK_TZ = ZoneInfo("Europe/London")

DataMode = Literal["snapshot", "live"]


@dataclass(frozen=True)
class DecisionTimePreset:
    id: str
    label: str
    time: time
    description: str


# Gate-closure times of the two GB day-ahead auctions (UK local time, on the day before delivery).
DECISION_TIME_PRESETS: tuple[DecisionTimePreset, ...] = (
    DecisionTimePreset(
        id="epex",
        label="EPEX day-ahead auction",
        time=time(9, 20),
        description="EPEX SPOT GB hourly day-ahead auction gate closure (10:20 CET).",
    ),
    DecisionTimePreset(
        id="n2ex",
        label="Nord Pool N2EX auction",
        time=time(9, 50),
        description="Nord Pool N2EX GB hourly day-ahead auction gate closure (10:50 CET).",
    ),
)

# Decision times swept by the "value of waiting" comparison.
COMPARISON_DECISION_TIMES: tuple[time, ...] = (
    time(0, 0),
    time(3, 0),
    time(6, 0),
    time(9, 20),
    time(9, 50),
    time(12, 0),
    time(15, 0),
    time(18, 0),
    time(21, 0),
)


@dataclass(frozen=True)
class Settings:
    """Runtime configuration. Every field can be overridden by an environment variable."""

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_s: float = 30.0
    elexon_max_retries: int = 3

    # Purchase decisions in scope: decisions made on these (UK) dates buy power for the next day.
    decision_date_from: date = date(2026, 1, 1)
    decision_date_to: date = date(2026, 1, 31)
    default_decision_time: time = time(9, 20)

    # How data is loaded at start-up: "snapshot" reads the bundled files (falling back to live
    # Elexon if they are missing); "live" calls Elexon (falling back to the snapshot on failure).
    data_mode: DataMode = "snapshot"
    snapshot_dir: Path = field(default=BACKEND_DIR / "data" / "snapshot")

    # Optional directory with the built React app, served by FastAPI in the Docker image.
    static_dir: Path | None = None

    @property
    def delivery_date_from(self) -> date:
        return date.fromordinal(self.decision_date_from.toordinal() + 1)

    @property
    def delivery_date_to(self) -> date:
        return date.fromordinal(self.decision_date_to.toordinal() + 1)


def _env_path(name: str) -> Path | None:
    value = os.getenv(name)
    return Path(value) if value else None


@lru_cache
def get_settings() -> Settings:
    defaults = Settings()
    mode = os.getenv("DATA_MODE", defaults.data_mode)
    if mode not in ("snapshot", "live"):
        raise ValueError(f"DATA_MODE must be 'snapshot' or 'live', got {mode!r}")
    return Settings(
        elexon_base_url=os.getenv("ELEXON_BASE_URL", defaults.elexon_base_url),
        elexon_timeout_s=float(os.getenv("ELEXON_TIMEOUT_S", defaults.elexon_timeout_s)),
        elexon_max_retries=int(os.getenv("ELEXON_MAX_RETRIES", defaults.elexon_max_retries)),
        data_mode=mode,  # type: ignore[arg-type]
        snapshot_dir=_env_path("SNAPSHOT_DIR") or defaults.snapshot_dir,
        static_dir=_env_path("STATIC_DIR"),
    )
