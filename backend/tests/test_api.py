"""API tests against the bundled January 2026 snapshot (no network)."""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.config import get_settings
from app.data.repository import load_dataset
from app.domain.analysis import WindAnalysis
from app.elexon.client import ElexonError
from app.main import create_app


@pytest.fixture(scope="module")
def analysis() -> WindAnalysis:
    settings = get_settings()
    return WindAnalysis(load_dataset(settings), settings)


@pytest.fixture
def client(analysis) -> TestClient:
    app = create_app()
    app.dependency_overrides[deps.get_analysis] = lambda: analysis
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_describes_scope_and_data(client):
    body = client.get("/api/meta").json()
    assert body["decision_date_from"] == "2026-01-01"
    assert body["delivery_date_to"] == "2026-02-01"
    assert body["data"]["source"] == "snapshot"
    assert body["data"]["forecast_publish_schedule_utc"] == [
        "02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30",
    ]  # fmt: skip


def test_day_defaults_to_epex_gate_closure(client):
    body = client.get("/api/day", params={"delivery_date": "2026-01-15"}).json()
    assert body["decision_time"] == "09:20"
    assert body["runs_used"] == ["2026-01-14T07:30:00Z"]
    assert len(body["hourly"]) == 24
    assert len(body["actuals"]) == 48


def test_day_with_n2ex_deadline_uses_the_0930_run(client):
    body = client.get(
        "/api/day", params={"delivery_date": "2026-01-15", "decision_time": "09:50"}
    ).json()
    assert body["runs_used"] == ["2026-01-14T09:30:00Z"]


def test_accuracy_defaults_to_full_scope(client):
    body = client.get("/api/accuracy").json()
    assert body["delivery_date_from"] == "2026-01-02"
    assert body["delivery_date_to"] == "2026-02-01"
    assert body["coverage"]["hours_evaluated"] == 31 * 24


@pytest.mark.parametrize(
    ("url", "params"),
    [
        ("/api/day", {"delivery_date": "2026-01-01"}),  # decision would be 31 Dec
        ("/api/day", {"delivery_date": "2026-02-02"}),
        ("/api/day", {"delivery_date": "2026-01-15", "decision_time": "24:00"}),
        ("/api/day", {"delivery_date": "2026-01-15", "decision_time": "9:20"}),
        ("/api/day", {}),
        ("/api/accuracy", {"from": "2026-01-20", "to": "2026-01-10"}),
        ("/api/accuracy", {"from": "2025-12-01"}),
    ],
)
def test_invalid_requests_are_rejected_with_422(client, url, params):
    response = client.get(url, params=params)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_data_source_outage_returns_503():
    def unavailable():
        raise ElexonError("down")

    app = create_app()
    app.dependency_overrides[deps.get_analysis] = unavailable
    response = TestClient(app).get("/api/meta")
    assert response.status_code == 503


def test_openapi_docs_are_served(client):
    assert client.get("/api/openapi.json").status_code == 200


class TestJanuary2026Regression:
    """Headline numbers from the bundled snapshot; a change here means the method changed."""

    def test_epex_deadline_headline_numbers(self, analysis):
        settings = analysis.settings
        report = analysis.accuracy_report(
            time(9, 20), settings.delivery_date_from, settings.delivery_date_to
        )
        assert report.summary.n == 744
        assert report.summary.mae_mw == pytest.approx(2038.9)
        assert report.summary.bias_mw == pytest.approx(1747.9)
        assert report.summary.rmse_mw == pytest.approx(2504.8)

    def test_every_day_uses_the_0730_run_at_epex_deadline(self, analysis):
        frame = analysis.evaluation_frame(time(9, 20))
        assert set(frame["publish_time"].dt.strftime("%H:%M")) == {"07:30"}
        assert frame["delivery_date"].nunique() == 31
        assert frame["delivery_date"].min() == date(2026, 1, 2)
