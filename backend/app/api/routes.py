"""HTTP endpoints. Thin: validate inputs, delegate to WindAnalysis, return its models."""

from __future__ import annotations

from datetime import date, time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_analysis
from app.domain.analysis import WindAnalysis
from app.domain.models import AccuracyReport, DayView, Meta

router = APIRouter(prefix="/api")

Analysis = Annotated[WindAnalysis, Depends(get_analysis)]
DecisionTime = Annotated[
    str | None,
    Query(
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="UK local time on the day before delivery when the purchase is decided "
        "(HH:MM). Defaults to the EPEX gate closure, 09:20.",
        examples=["09:20"],
    ),
]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta", response_model=Meta)
def meta(analysis: Analysis) -> Meta:
    """Date ranges in scope, decision-time presets and data provenance/quality."""
    return analysis.meta()


@router.get("/day", response_model=DayView)
def day(
    analysis: Analysis,
    delivery_date: Annotated[
        date, Query(description="UK delivery day (the day after the decision)")
    ],
    decision_time: DecisionTime = None,
) -> DayView:
    """What the buyer knew at decision time for one delivery day, and what actually happened."""
    settings = analysis.settings
    _require_in_scope(delivery_date, settings.delivery_date_from, settings.delivery_date_to)
    return analysis.day_view(delivery_date, _parse_time(decision_time, analysis))


@router.get("/accuracy", response_model=AccuracyReport)
def accuracy(
    analysis: Analysis,
    date_from: Annotated[date | None, Query(alias="from", description="First delivery day")] = None,
    date_to: Annotated[date | None, Query(alias="to", description="Last delivery day")] = None,
    decision_time: DecisionTime = None,
) -> AccuracyReport:
    """Accuracy of the forecasts available at decision time over a range of delivery days."""
    settings = analysis.settings
    first = date_from or settings.delivery_date_from
    last = date_to or settings.delivery_date_to
    _require_in_scope(first, settings.delivery_date_from, settings.delivery_date_to)
    _require_in_scope(last, settings.delivery_date_from, settings.delivery_date_to)
    if first > last:
        raise HTTPException(status_code=422, detail="'from' must not be after 'to'.")
    return analysis.accuracy_report(_parse_time(decision_time, analysis), first, last)


def _parse_time(value: str | None, analysis: WindAnalysis) -> time:
    if value is None:
        return analysis.settings.default_decision_time
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def _require_in_scope(value: date, first: date, last: date) -> None:
    if not first <= value <= last:
        raise HTTPException(
            status_code=422,
            detail=f"Delivery date {value} is outside the analysed range {first} to {last}.",
        )
