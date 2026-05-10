# SPDX-License-Identifier: Apache-2.0
"""Project CRUD."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, status

from yuipath_api import events
from yuipath_api.deps import current_user, project_membership
from yuipath_api.models import (
    EventKind,
    Membership,
    Project,
    ProjectCreateInput,
    ProjectId,
    ProjectUpdateInput,
    Role,
    TargetRef,
    User,
)
from yuipath_api.models.membership import Membership as MembershipModel
from yuipath_api.permissions import can_admin_project, can_read_project
from yuipath_api.store import VersionConflict, dynamo

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("", response_model=list[Project])
def list_projects(user: User = Depends(current_user)) -> list[Project]:
    if user.is_system_admin:
        return dynamo.list_projects()
    project_ids = dynamo.list_projects_for_user(user.id)
    return [p for pid in project_ids if (p := dynamo.get_project(pid)) is not None]


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreateInput, user: User = Depends(current_user)) -> Project:
    pid = ProjectId(str(uuid.uuid4()))
    now = _now()
    project = Project(
        id=pid,
        name=body.name,
        description=body.description,
        calendar_template_id=body.calendar_template_id,
        version=0,
        created_at=now,
        updated_at=now,
    )
    dynamo.put_project(project)
    dynamo.put_membership(
        MembershipModel(
            user_id=user.id,
            project_id=pid,
            role=Role.PROJECT_ADMIN,
            joined_at=now,
        )
    )
    events.append(
        actor=user.id,
        project_id=pid,
        kind=EventKind.PROJECT_CREATED,
        target=TargetRef(type="project", id=pid),
        payload={"name": project.name},
    )
    return project


@router.get("/{project_id}", response_model=Project)
def get_project(
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Project:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    project = dynamo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return project


@router.patch("/{project_id}", response_model=Project)
def update_project(
    body: ProjectUpdateInput,
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Project:
    if not can_admin_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    current = dynamo.get_project(project_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if current.version != body.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict")

    updated = current.model_copy(
        update={
            "name": body.name if body.name is not None else current.name,
            "description": body.description
            if body.description is not None
            else current.description,
            "calendar_template_id": body.calendar_template_id
            if body.calendar_template_id is not None
            else current.calendar_template_id,
            "version": current.version + 1,
            "updated_at": _now(),
        }
    )
    try:
        dynamo.put_project(updated, expected_version=current.version)
    except VersionConflict as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict") from e
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.PROJECT_UPDATED,
        target=TargetRef(type="project", id=project_id),
        payload=body.model_dump(exclude={"expected_version"}, exclude_none=True),
    )
    return updated


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> None:
    if not can_admin_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    if dynamo.get_project(project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    dynamo.delete_project(project_id)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.PROJECT_DELETED,
        target=TargetRef(type="project", id=project_id),
    )
