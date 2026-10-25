import math

import pandas as pd
import pytest

from app.domain.metrics import error_summary, histogram, planning_margins


def test_error_summary_known_values():
    forecast = pd.Series([10.0, 20.0, 30.0])
    actual = pd.Series([8.0, 25.0, 30.0])  # errors: +2, -5, 0
    s = error_summary(forecast, actual)
    assert s.n == 3
    assert s.mae_mw == pytest.approx(round(7 / 3, 1))
    assert s.rmse_mw == pytest.approx(round(math.sqrt(29 / 3), 1))
    assert s.bias_mw == pytest.approx(-1.0)
    assert s.wape == pytest.approx(round(7 / 63, 4))
    assert s.max_over_forecast_mw == 2.0
    assert s.max_under_forecast_mw == -5.0


def test_positive_bias_means_forecast_too_high():
    assert error_summary(pd.Series([110.0]), pd.Series([100.0])).bias_mw == 10.0


def test_missing_pairs_are_ignored():
    forecast = pd.Series([10.0, None, 30.0])
    actual = pd.Series([10.0, 5.0, None])
    s = error_summary(forecast, actual)
    assert s.n == 1
    assert s.mae_mw == 0.0


def test_empty_input_returns_nulls_not_errors():
    s = error_summary(pd.Series([], dtype=float), pd.Series([], dtype=float))
    assert s.n == 0
    assert s.mae_mw is None
    assert s.wape is None


def test_wape_undefined_when_no_actual_output():
    assert error_summary(pd.Series([5.0]), pd.Series([0.0])).wape is None


def test_planning_margin_is_error_quantile():
    errors = pd.Series(range(0, 101), dtype=float)  # 0..100
    margins = {m.confidence: m.margin_mw for m in planning_margins(errors)}
    assert margins[0.5] == 50.0
    assert margins[0.9] == 90.0


def test_histogram_counts_every_error_once():
    errors = pd.Series([-600.0, -10.0, 0.0, 10.0, 499.0, 1200.0])
    bins = histogram(errors, bin_width_mw=500)
    assert sum(b.count for b in bins) == len(errors)
    assert bins[0].from_mw == -1000.0
    assert bins[-1].to_mw == 1500.0


def test_histogram_of_identical_values_has_one_bin():
    bins = histogram(pd.Series([500.0, 500.0]), bin_width_mw=500)
    assert sum(b.count for b in bins) == 2
