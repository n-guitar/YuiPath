# SPDX-License-Identifier: Apache-2.0
"""Comment CRUD (attached to tasks)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, status

from yuipath_api import events
from yuipath_api.deps import current_user, project_membership
from yuipath_api.models import (
    Comment,
    CommentCreateInput,
    CommentId,
    CommentUpdateInput,
    EventKind,
    Membership,
    TargetRef,
    TaskId,
    User,
)
from yuipath_api.models.ids import ProjectId
from yuipath_api.permissions import can_admin_project, can_read_project
from yuipath_api.store import VersionConflict, dynamo

router = APIRouter(
    prefix="/api/projects/{project_id}/tasks/{task_id}/comments", tags=["comments"]
)


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("", response_model=list[Comment])
def list_comments(
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> list[Comment]:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    if dynamo.get_task(project_id, task_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    return dynamo.list_comments(task_id)


@router.post("", response_model=Comment, status_code=status.HTTP_201_CREATED)
def create_comment(
    body: CommentCreateInput,
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Comment:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    if dynamo.get_task(project_id, task_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    cid = CommentId(str(uuid.uuid4()))
    now = _now()
    comment = Comment(
        id=cid,
        task_id=task_id,
        author_id=user.id,
        body=body.body,
        version=0,
        created_at=now,
        updated_at=now,
    )
    dynamo.put_comment(comment)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.COMMENT_CREATED,
        target=TargetRef(type="comment", id=cid),
        payload={"task_id": task_id},
    )
    return comment


@router.patch("/{comment_id}", response_model=Comment)
def update_comment(
    body: CommentUpdateInput,
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    comment_id: CommentId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Comment:
    current = dynamo.get_comment(task_id, comment_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    is_admin = can_admin_project(user, membership)
    if not is_admin and current.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not your comment")
    if current.version != body.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict")
    updated = current.model_copy(
        update={
            "body": body.body,
            "version": current.version + 1,
            "updated_at": _now(),
        }
    )
    try:
        dynamo.put_comment(updated, expected_version=current.version)
    except VersionConflict as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict") from e
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.COMMENT_UPDATED,
        target=TargetRef(type="comment", id=comment_id),
    )
    return updated


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    project_id: ProjectId = Path(...),
    task_id: TaskId = Path(...),
    comment_id: CommentId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> None:
    current = dynamo.get_comment(task_id, comment_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    is_admin = can_admin_project(user, membership)
    if not is_admin and current.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not your comment")
    dynamo.delete_comment(task_id, comment_id)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.COMMENT_DELETED,
        target=TargetRef(type="comment", id=comment_id),
    )
