# SPDX-License-Identifier: Apache-2.0
"""End-to-end route tests against moto-mocked DynamoDB."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from yuipath_api.main import app


@pytest.fixture
def client(dynamodb_table: None) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_me_returns_dev_user(client: TestClient) -> None:
    r = client.get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "local-user"
    assert body["is_system_admin"] is True


def test_project_create_then_get(client: TestClient) -> None:
    r = client.post("/api/projects", json={"name": "alpha", "description": "test"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 200
    assert r.json()["name"] == "alpha"


def test_project_list_returns_created(client: TestClient) -> None:
    client.post("/api/projects", json={"name": "p1"})
    client.post("/api/projects", json={"name": "p2"})
    r = client.get("/api/projects")
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "p1" in names and "p2" in names


def test_project_update_with_correct_version(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    r = client.patch(
        f"/api/projects/{pid}",
        json={"name": "renamed", "expected_version": 0},
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "renamed"
    assert r.json()["version"] == 1


def test_project_update_with_wrong_version_409(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    r = client.patch(
        f"/api/projects/{pid}",
        json={"name": "renamed", "expected_version": 99},
    )
    assert r.status_code == 409


def test_project_delete(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204
    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 404


def test_task_crud(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    r = client.post(
        f"/api/projects/{pid}/tasks",
        json={
            "name": "t1",
            "start": "2026-06-01",
            "end": "2026-06-05",
            "duration": 5,
            "status": "todo",
        },
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]

    r = client.patch(
        f"/api/projects/{pid}/tasks/{tid}",
        json={"status": "in-progress-50", "expected_version": 0},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in-progress-50"
    assert r.json()["progress"] == 0.5

    r = client.get(f"/api/projects/{pid}/tasks")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.delete(f"/api/projects/{pid}/tasks/{tid}")
    assert r.status_code == 204


def test_event_log_records_project_creation(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    r = client.get(f"/api/projects/{pid}/events")
    assert r.status_code == 200
    events = r.json()
    assert any(e["kind"] == "project.created" for e in events)


def test_comment_crud(client: TestClient) -> None:
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    tid = client.post(
        f"/api/projects/{pid}/tasks",
        json={
            "name": "t",
            "start": "2026-06-01",
            "end": "2026-06-01",
            "duration": 1,
            "status": "todo",
        },
    ).json()["id"]
    r = client.post(
        f"/api/projects/{pid}/tasks/{tid}/comments",
        json={"body": "hello"},
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]

    r = client.patch(
        f"/api/projects/{pid}/tasks/{tid}/comments/{cid}",
        json={"body": "updated", "expected_version": 0},
    )
    assert r.status_code == 200
    assert r.json()["body"] == "updated"

    r = client.delete(f"/api/projects/{pid}/tasks/{tid}/comments/{cid}")
    assert r.status_code == 204


def test_calendar_template_crud(client: TestClient) -> None:
    r = client.post(
        "/api/calendar-templates",
        json={"name": "standard", "holidays": []},
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]

    r = client.patch(
        f"/api/calendar-templates/{cid}",
        json={"name": "updated", "expected_version": 0},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "updated"

    r = client.delete(f"/api/calendar-templates/{cid}")
    assert r.status_code == 204
