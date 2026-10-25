"""Error statistics. Pure functions over pandas Series; NaN pairs are ignored.

Percentage errors (MAPE) are deliberately not used: wind output can be close to zero, which
makes percentage errors explode. WAPE (total absolute error / total output) is used instead.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.domain.models import ErrorSummary, HistogramBin, PlanningMargin

PLANNING_CONFIDENCES = (0.5, 0.8, 0.9, 0.95)


def rounded(value: float | None, digits: int = 1) -> float | None:
    if value is None or math.isnan(value):
        return None
    return round(float(value), digits)


def paired(forecast: pd.Series, actual: pd.Series) -> tuple[pd.Series, pd.Series]:
    mask = forecast.notna() & actual.notna()
    return forecast[mask], actual[mask]


def error_summary(forecast: pd.Series, actual: pd.Series) -> ErrorSummary:
    f, a = paired(forecast, actual)
    errors = f - a
    n = len(errors)
    if n == 0:
        return ErrorSummary(
            n=0, mae_mw=None, rmse_mw=None, bias_mw=None, wape=None, median_abs_error_mw=None,
            p90_abs_error_mw=None, p10_error_mw=None, p90_error_mw=None,
            max_over_forecast_mw=None, max_under_forecast_mw=None, mean_actual_mw=None,
            mean_forecast_mw=None,
        )  # fmt: skip
    abs_errors = errors.abs()
    total_actual = float(a.sum())
    return ErrorSummary(
        n=n,
        mae_mw=rounded(abs_errors.mean()),
        rmse_mw=rounded(math.sqrt(float((errors**2).mean()))),
        bias_mw=rounded(errors.mean()),
        wape=rounded(abs_errors.sum() / total_actual, 4) if total_actual > 0 else None,
        median_abs_error_mw=rounded(abs_errors.quantile(0.5)),
        p90_abs_error_mw=rounded(abs_errors.quantile(0.9)),
        p10_error_mw=rounded(errors.quantile(0.1)),
        p90_error_mw=rounded(errors.quantile(0.9)),
        max_over_forecast_mw=rounded(errors.max()),
        max_under_forecast_mw=rounded(errors.min()),
        mean_actual_mw=rounded(a.mean()),
        mean_forecast_mw=rounded(f.mean()),
    )


def planning_margins(errors: pd.Series) -> list[PlanningMargin]:
    """For each confidence c: the margin m such that, historically, actual >= forecast - m in a
    fraction c of hours. That is the c-quantile of (forecast - actual)."""
    clean = errors.dropna()
    return [
        PlanningMargin(confidence=c, margin_mw=rounded(clean.quantile(c)) if len(clean) else None)
        for c in PLANNING_CONFIDENCES
    ]


def histogram(errors: pd.Series, bin_width_mw: float = 500.0) -> list[HistogramBin]:
    clean = errors.dropna().to_numpy()
    if clean.size == 0:
        return []
    lower = math.floor(clean.min() / bin_width_mw) * bin_width_mw
    upper = math.ceil(clean.max() / bin_width_mw) * bin_width_mw
    if upper == lower:
        upper = lower + bin_width_mw
    edges = np.arange(lower, upper + bin_width_mw / 2, bin_width_mw)
    counts, edges = np.histogram(clean, bins=edges)
    return [
        HistogramBin(from_mw=float(lo), to_mw=float(hi), count=int(count))
        for lo, hi, count in zip(edges[:-1], edges[1:], counts, strict=True)
    ]
