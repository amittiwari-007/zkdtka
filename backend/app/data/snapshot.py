"""Bundled copy of the raw Elexon responses.

The snapshot makes the deployed app fast to cold-start and keeps it working if Elexon is down.
It stores the rows exactly as Elexon returned them, so it goes through the same validation and
cleaning path as a live fetch. Regenerate it with `python -m scripts.fetch_snapshot`.
"""

from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app.elexon.client import RawRow

ACTUALS_FILE = "actuals_fuelhh_wind.json.gz"
FORECASTS_FILE = "forecasts_windfor.json.gz"
MANIFEST_FILE = "manifest.json"


@dataclass(frozen=True)
class RawSnapshot:
    actual_rows: list[RawRow]
    forecast_rows: list[RawRow]
    fetched_at: datetime
    queries: dict[str, Any]


def write_snapshot(directory: Path, snapshot: RawSnapshot) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    _write_gz_json(directory / ACTUALS_FILE, snapshot.actual_rows)
    _write_gz_json(directory / FORECASTS_FILE, snapshot.forecast_rows)
    manifest = {
        "fetched_at": snapshot.fetched_at.isoformat(),
        "queries": snapshot.queries,
        "actual_rows": len(snapshot.actual_rows),
        "forecast_rows": len(snapshot.forecast_rows),
    }
    (directory / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n")


def read_snapshot(directory: Path) -> RawSnapshot | None:
    """Return the snapshot in `directory`, or None if any of its files is missing."""
    paths = [directory / name for name in (ACTUALS_FILE, FORECASTS_FILE, MANIFEST_FILE)]
    if not all(path.is_file() for path in paths):
        return None
    manifest = json.loads((directory / MANIFEST_FILE).read_text())
    return RawSnapshot(
        actual_rows=_read_gz_json(directory / ACTUALS_FILE),
        forecast_rows=_read_gz_json(directory / FORECASTS_FILE),
        fetched_at=datetime.fromisoformat(manifest["fetched_at"]),
        queries=manifest.get("queries", {}),
    )


def _write_gz_json(path: Path, rows: list[RawRow]) -> None:
    # mtime=0 keeps the file byte-identical across regenerations with unchanged data.
    with path.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as fh:
        fh.write(json.dumps(rows, separators=(",", ":")).encode())


def _read_gz_json(path: Path) -> list[RawRow]:
    with gzip.open(path, "rb") as fh:
        rows: list[RawRow] = json.loads(fh.read())
    return rows
