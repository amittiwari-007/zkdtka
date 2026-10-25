"""FastAPI application factory.

Serves the JSON API under /api and, when STATIC_DIR is set (Docker image), the built React app.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import Settings, get_settings
from app.elexon.client import ElexonError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Wind Forecast Decision Support API",
        version="1.0.0",
        description="UK national wind generation forecasts as available at day-ahead purchase "
        "decision time, and their measured accuracy (Elexon BMRS FUELHH + WINDFOR).",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    cors_origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
    if cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_methods=["GET"])

    @app.exception_handler(ElexonError)
    def data_unavailable(_: Request, exc: ElexonError) -> JSONResponse:
        logging.getLogger(__name__).error("Data source unavailable: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "Wind data is temporarily unavailable. Please retry shortly."},
        )

    app.include_router(router)

    if settings.static_dir and settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")

    return app


app = create_app()
