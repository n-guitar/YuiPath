# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv==0.8.17

WORKDIR /app

# Install deps first (layer cache)
COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

# App source
COPY src ./src

EXPOSE 8000
CMD ["uvicorn", "yuipath_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
