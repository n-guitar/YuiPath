# SPDX-License-Identifier: Apache-2.0
"""Membership management."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, status

from yuipath_api import events
from yuipath_api.deps import current_user, project_membership
from yuipath_api.models import (
    EventKind,
    Membership,
    MembershipCreateInput,
    MembershipUpdateInput,
    Role,
    TargetRef,
    User,
    UserId,
)
from yuipath_api.models.ids import ProjectId
from yuipath_api.permissions import (
    can_admin_project,
    can_demote_member,
    can_promote_member,
    can_read_project,
)
from yuipath_api.store import dynamo

router = APIRouter(prefix="/api/projects/{project_id}/members", tags=["members"])


def _now() -> datetime:
    return datetime.now(UTC)


def _admin_count(memberships: list[Membership]) -> int:
    return sum(1 for m in memberships if m.role == Role.PROJECT_ADMIN)


@router.get("", response_model=list[Membership])
def list_members(
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> list[Membership]:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    return dynamo.list_memberships_in_project(project_id)


@router.post("", response_model=Membership, status_code=status.HTTP_201_CREATED)
def add_member(
    body: MembershipCreateInput,
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Membership:
    if not can_admin_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    new_member = Membership(
        user_id=body.user_id,
        project_id=project_id,
        role=body.role,
        color=body.color,
        capacity=body.capacity,
        allocation=body.allocation,
        joined_at=_now(),
    )
    dynamo.put_membership(new_member)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.MEMBER_ADDED,
        target=TargetRef(type="membership", id=str(body.user_id)),
        payload={"role": body.role.value},
    )
    return new_member


@router.patch("/{user_id}", response_model=Membership)
def update_member(
    body: MembershipUpdateInput,
    project_id: ProjectId = Path(...),
    user_id: UserId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> Membership:
    if not can_admin_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    target = dynamo.get_membership(project_id, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    if body.role is not None and body.role != target.role:
        all_members = dynamo.list_memberships_in_project(project_id)
        admin_count = _admin_count(all_members)
        if body.role == Role.PROJECT_ADMIN and target.role == Role.PROJECT_MEMBER:
            assert membership is not None
            if not can_promote_member(membership, user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="cannot self-promote"
                )
        if body.role == Role.PROJECT_MEMBER and target.role == Role.PROJECT_ADMIN:
            others = admin_count - 1
            assert membership is not None
            if not can_demote_member(membership, target, others):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="cannot demote: would leave 0 admins",
                )

    updates: dict[str, object] = {}
    if body.role is not None:
        updates["role"] = body.role
    if body.color is not None:
        updates["color"] = body.color
    if body.capacity is not None:
        updates["capacity"] = body.capacity
    if body.allocation is not None:
        updates["allocation"] = body.allocation
    updated = target.model_copy(update=updates)
    dynamo.put_membership(updated)
    if body.role is not None and body.role != target.role:
        events.append(
            actor=user.id,
            project_id=project_id,
            kind=EventKind.MEMBER_ROLE_CHANGED,
            target=TargetRef(type="membership", id=str(user_id)),
            payload={"from": target.role.value, "to": body.role.value},
        )
    return updated


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: ProjectId = Path(...),
    user_id: UserId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> None:
    if not can_admin_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin required")
    target = dynamo.get_membership(project_id, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if target.role == Role.PROJECT_ADMIN:
        all_members = dynamo.list_memberships_in_project(project_id)
        if _admin_count(all_members) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="cannot remove last admin",
            )
    dynamo.delete_membership(project_id, user_id)
    events.append(
        actor=user.id,
        project_id=project_id,
        kind=EventKind.MEMBER_REMOVED,
        target=TargetRef(type="membership", id=str(user_id)),
    )
