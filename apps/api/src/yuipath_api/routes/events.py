# SPDX-License-Identifier: Apache-2.0
"""Event Log query (Activity Feed)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from yuipath_api.deps import current_user, project_membership
from yuipath_api.models import Event, Membership, ProjectId, User
from yuipath_api.permissions import can_read_project
from yuipath_api.store import dynamo

router = APIRouter(tags=["events"])


@router.get("/api/projects/{project_id}/events", response_model=list[Event])
def list_project_events(
    project_id: ProjectId = Path(...),
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> list[Event]:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    return dynamo.list_events_by_project(project_id, limit=limit)


@router.get("/api/events/by-target", response_model=list[Event])
def list_target_events(
    type: str = Query(..., description="task | comment | project | membership | calendar"),
    id: str = Query(...),
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(current_user),
) -> list[Event]:
    return dynamo.list_events_by_target(type, id, limit=limit)
