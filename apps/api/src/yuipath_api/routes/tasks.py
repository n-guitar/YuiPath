# SPDX-License-Identifier: Apache-2.0
"""Task CRUD."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, status

from yuipath_api import events
from yuipath_api.deps import current_user, project_membership
from yuipath_api.models import (
    STATUS_PROGRESS,
    EventKind,
    Membership,
    TargetRef,
    Task,
    TaskCreateInput,
    TaskId,
    TaskUpdateInput,
    User,
)
from yuipath_api.models.ids import ProjectId
from yuipath_api.permissions import (
    can_admin_project,
    can_change_task_assignment,
    can_read_project,
    can_write_task,
    is_own_task,
)
from yuipath_api.store import VersionConflict, dynamo

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("", response_model=list[Task])
def list_tasks(
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> list[Task]:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    return dynamo.list_tasks(project_id)


@router.post("", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreateInput,
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Task:
    is_admin = can_admin_project(user, membership)
    if not is_admin:
        if membership is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
        if body.owner is not None and body.owner != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="members can only create their own tasks",
            )
    tid = TaskId(str(uuid.uuid4()))
    now = _now()
    progress = body.progress if body.progress is not None else STATUS_PROGRESS.get(body.status, 0.0)
    task = Task(
        id=tid,
        project_id=project_id,
        name=body.name,
        description=body.description,
        parent=body.parent,
        is_phase=body.is_phase,
        start=body.start,
        end=body.end,
        duration=body.duration,
        status=body.status,
        progress=progress,
        owner=body.owner if body.owner else (None if is_admin else user.id),
        subs=body.subs,
        predecessors=body.predecessors,
        critical=False,
        milestone=body.milestone,
        depth=body.depth,
        version=0,
        created_at=now,
        updated_at=now,
    )
    dynamo.put_task(task)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.TASK_CREATED,
        target=TargetRef(type="task", id=tid),
        payload={"name": task.name},
    )
    return task


@router.get("/{task_id}", response_model=Task)
def get_task(
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Task:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    task = dynamo.get_task(project_id, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return task


@router.patch("/{task_id}", response_model=Task)
def update_task(
    body: TaskUpdateInput,
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Task:
    current = dynamo.get_task(project_id, task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if current.version != body.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict")
    if not can_write_task(user, membership, current):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not your task")

    is_admin = can_admin_project(user, membership)
    is_own = is_own_task(user, current)

    if (
        body.owner is not None
        and body.owner != current.owner
        and not is_admin
        and not (is_own and body.owner == user.id)
        and body.owner != user.id
        and not can_change_task_assignment(user, membership)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="reassign requires admin",
        )
    if body.subs is not None and set(body.subs) != set(current.subs):
        new_subs, old_subs = set(body.subs), set(current.subs)
        added_others = (new_subs - old_subs) - {user.id}
        removed_others = (old_subs - new_subs) - {user.id}
        if (added_others or removed_others) and not can_change_task_assignment(user, membership):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="reassign requires admin",
            )

    updates: dict[str, object] = {"version": current.version + 1, "updated_at": _now()}
    for field in (
        "name",
        "description",
        "parent",
        "is_phase",
        "start",
        "end",
        "duration",
        "status",
        "owner",
        "subs",
        "predecessors",
        "milestone",
        "depth",
    ):
        v = getattr(body, field)
        if v is not None:
            updates[field] = v
    if body.progress is not None:
        updates["progress"] = body.progress
    elif body.status is not None and body.progress is None:
        updates["progress"] = STATUS_PROGRESS.get(body.status, current.progress)

    updated = current.model_copy(update=updates)
    try:
        dynamo.put_task(updated, expected_version=current.version)
    except VersionConflict as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict") from e
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.TASK_UPDATED,
        target=TargetRef(type="task", id=task_id),
        payload=body.model_dump(exclude={"expected_version"}, exclude_none=True),
    )
    return updated


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> None:
    current = dynamo.get_task(project_id, task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if not can_write_task(user, membership, current):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not your task")
    dynamo.delete_task(project_id, task_id)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.TASK_DELETED,
        target=TargetRef(type="task", id=task_id),
    )
