"""Vercel serverless entry point: exposes the FastAPI app from backend/ as an ASGI function.

vercel.json rewrites every /api/* request here; FastAPI routes on the original path.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
