"""Write the API's OpenAPI schema to the frontend, which generates its TypeScript types from it.

Usage (from backend/):  python -m scripts.export_openapi [output_path]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.main import create_app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "api" / "openapi.json"


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)
    schema = create_app().openapi()
    output.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
