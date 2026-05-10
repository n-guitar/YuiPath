# SPDX-License-Identifier: Apache-2.0
"""Smoke tests for health endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
from yuipath_api.main import app


def test_healthz() -> None:
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz() -> None:
    client = TestClient(app)
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
