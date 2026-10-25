"""FastAPI dependencies. The dataset is loaded lazily on first use and shared afterwards
(works the same under uvicorn and in a serverless function, where lifespan hooks may not run)."""

from __future__ import annotations

import threading

from app.config import Settings, get_settings
from app.data.repository import load_dataset
from app.domain.analysis import WindAnalysis

_lock = threading.Lock()
_analysis: WindAnalysis | None = None


def get_analysis() -> WindAnalysis:
    global _analysis
    if _analysis is None:
        with _lock:
            if _analysis is None:
                settings = get_settings()
                _analysis = WindAnalysis(load_dataset(settings), settings)
    return _analysis


def get_app_settings() -> Settings:
    return get_settings()
