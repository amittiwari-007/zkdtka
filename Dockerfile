# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- frontend build
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------- python base
FROM python:3.12-slim AS backend-base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---------------------------------------------------------------- dev backend (code is bind-mounted)
FROM backend-base AS backend-dev
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "backend/app"]

# ---------------------------------------------------------------- production image: API + built UI
FROM backend-base AS runtime
COPY backend/app ./backend/app
COPY backend/data ./backend/data
COPY --from=frontend-build /build/dist ./static
ENV STATIC_DIR=/app/static \
    DATA_MODE=snapshot \
    PORT=8000
RUN useradd --create-home --uid 10001 app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=2)"
CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT} --proxy-headers"]
