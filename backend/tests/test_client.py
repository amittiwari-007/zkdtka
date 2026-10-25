from datetime import date, datetime

import httpx
import pytest
import respx

from app.elexon.client import ElexonClient, ElexonError
from tests.conftest import ts

BASE = "https://elexon.test/bmrs/api/v1"
FUELHH = f"{BASE}/datasets/FUELHH/stream"
WINDFOR = f"{BASE}/datasets/WINDFOR/stream"


def client(**kwargs) -> ElexonClient:
    return ElexonClient(BASE, backoff_s=0, **kwargs)


@respx.mock
def test_actuals_query_filters_wind_and_chunks_by_week():
    route = respx.get(FUELHH).mock(return_value=httpx.Response(200, json=[{"x": 1}]))
    rows = client(chunk_days=7).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 10))
    assert len(rows) == 2
    params = [dict(call.request.url.params) for call in route.calls]
    assert params == [
        {"settlementDateFrom": "2026-01-01", "settlementDateTo": "2026-01-07", "fuelType": "WIND"},
        {"settlementDateFrom": "2026-01-08", "settlementDateTo": "2026-01-10", "fuelType": "WIND"},
    ]


@respx.mock
def test_forecast_query_uses_publish_time_window_in_utc():
    route = respx.get(WINDFOR).mock(return_value=httpx.Response(200, json=[]))
    client(chunk_days=7).fetch_wind_forecasts(ts("2026-01-01T00:00"), ts("2026-01-03T00:00"))
    assert dict(route.calls[0].request.url.params) == {
        "publishDateTimeFrom": "2026-01-01T00:00:00Z",
        "publishDateTimeTo": "2026-01-03T00:00:00Z",
    }


@respx.mock
def test_retries_transient_failures_then_succeeds():
    route = respx.get(FUELHH).mock(
        side_effect=[
            httpx.Response(503),
            httpx.ConnectError("down"),
            httpx.Response(200, json=[{"ok": True}]),
        ]
    )
    assert client(max_retries=3).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1)) == [
        {"ok": True}
    ]
    assert route.call_count == 3


@respx.mock
def test_gives_up_after_max_retries():
    respx.get(FUELHH).mock(return_value=httpx.Response(429))
    with pytest.raises(ElexonError, match="failed after retries"):
        client(max_retries=2).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))


@respx.mock
def test_client_errors_are_not_retried():
    route = respx.get(FUELHH).mock(return_value=httpx.Response(400, text="bad request"))
    with pytest.raises(ElexonError, match="HTTP 400"):
        client(max_retries=3).fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert route.call_count == 1


@respx.mock
def test_accepts_data_envelope():
    respx.get(FUELHH).mock(return_value=httpx.Response(200, json={"data": [{"a": 1}]}))
    assert client().fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1)) == [{"a": 1}]


@respx.mock
def test_rejects_unexpected_payload():
    respx.get(FUELHH).mock(return_value=httpx.Response(200, json="nope"))
    with pytest.raises(ElexonError, match="Unexpected payload"):
        client().fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))


def test_naive_datetimes_are_refused():
    with pytest.raises(ValueError, match="timezone-aware"):
        client().fetch_wind_forecasts(datetime(2026, 1, 1), datetime(2026, 1, 2))
