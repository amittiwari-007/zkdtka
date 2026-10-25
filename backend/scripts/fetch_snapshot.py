"""Download the in-scope Elexon data and store it as the bundled snapshot.

Usage (from backend/):  python -m scripts.fetch_snapshot
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.data.repository import build_dataset, fetch_raw
from app.data.snapshot import write_snapshot
from app.elexon.client import ElexonClient


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = get_settings()
    with ElexonClient(
        settings.elexon_base_url,
        timeout_s=settings.elexon_timeout_s,
        max_retries=settings.elexon_max_retries,
    ) as client:
        raw = fetch_raw(settings, client)
    write_snapshot(settings.snapshot_dir, raw)
    quality = build_dataset(raw, source="live", settings=settings).quality
    logging.info("Wrote snapshot to %s", settings.snapshot_dir)
    logging.info("Data quality: %s", quality)


if __name__ == "__main__":
    main()
