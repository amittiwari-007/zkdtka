"""Thin HTTP client for the Elexon BMRS "stream" endpoints.

Responsibilities: build the queries, split long ranges into chunks, retry transient failures.
It returns raw JSON rows; validation and cleaning happen in the data layer.
"""

from __future__ import annotations

import logging
import time as time_module
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RawRow = dict[str, Any]

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ElexonError(RuntimeError):
    """Raised when Elexon cannot be reached or returns an unusable response."""


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout_s: float = 30.0,
        max_retries: int = 3,
        backoff_s: float = 1.0,
        chunk_days: int = 7,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_s,
            transport=transport,
            headers={"Accept": "application/json"},
        )
        self._max_retries = max_retries
        self._backoff_s = backoff_s
        self._chunk_days = chunk_days

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def fetch_wind_actuals(
        self, settlement_date_from: date, settlement_date_to: date
    ) -> list[RawRow]:
        """Half-hourly outturn wind generation (FUELHH, fuelType=WIND) for whole settlement days."""
        rows: list[RawRow] = []
        for start, end in _date_chunks(settlement_date_from, settlement_date_to, self._chunk_days):
            rows += self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": start.isoformat(),
                    "settlementDateTo": end.isoformat(),
                    "fuelType": "WIND",
                },
            )
        return rows

    def fetch_wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> list[RawRow]:
        """Every WINDFOR forecast point whose run was published in [publish_from, publish_to]."""
        rows: list[RawRow] = []
        for start, end in _datetime_chunks(publish_from, publish_to, self._chunk_days):
            rows += self._get(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso_z(start), "publishDateTimeTo": _iso_z(end)},
            )
        return rows

    def _get(self, path: str, params: dict[str, str]) -> list[RawRow]:
        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            if attempt:
                delay = self._backoff_s * 2 ** (attempt - 1)
                logger.warning(
                    "Retrying %s in %.1fs (attempt %d): %s", path, delay, attempt, last_error
                )
                time_module.sleep(delay)
            try:
                response = self._client.get(path, params=params)
            except httpx.TransportError as exc:
                last_error = exc
                continue
            if response.status_code in RETRYABLE_STATUS:
                last_error = ElexonError(f"HTTP {response.status_code} from {path}")
                continue
            if response.is_error:
                raise ElexonError(f"HTTP {response.status_code} from {path}: {response.text[:200]}")
            payload = response.json()
            # Stream endpoints return a bare list; tolerate the {"data": [...]} envelope too.
            if isinstance(payload, dict):
                payload = payload.get("data", [])
            if not isinstance(payload, list):
                raise ElexonError(f"Unexpected payload type from {path}: {type(payload).__name__}")
            return payload
        raise ElexonError(f"Elexon request to {path} failed after retries: {last_error}")


def _date_chunks(start: date, end: date, days: int) -> Iterator[tuple[date, date]]:
    """Inclusive [start, end] split into consecutive inclusive chunks of at most `days` days."""
    if end < start:
        raise ValueError("end must not be before start")
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=days - 1), end)
        yield cursor, chunk_end
        cursor = chunk_end + timedelta(days=1)


def _datetime_chunks(
    start: datetime, end: datetime, days: int
) -> Iterator[tuple[datetime, datetime]]:
    """[start, end] split into consecutive chunks; adjacent chunks share a boundary instant,
    so callers must de-duplicate (the data layer does)."""
    if end < start:
        raise ValueError("end must not be before start")
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=days), end)
        yield cursor, chunk_end
        cursor = chunk_end


def _iso_z(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("datetimes sent to Elexon must be timezone-aware")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
