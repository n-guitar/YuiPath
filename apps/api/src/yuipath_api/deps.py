# SPDX-License-Identifier: Apache-2.0
"""FastAPI dependencies (current_user, project membership lookup)."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Path, Request, status

from yuipath_api.auth import resolve_user
from yuipath_api.models import Membership, ProjectId, User
from yuipath_api.permissions import can_read_project
from yuipath_api.store import dynamo


def current_user(request: Request) -> User:
    return resolve_user(request)


def project_membership(
    project_id: ProjectId = Path(..., description="Project id"),
    user: User = Depends(current_user),
) -> Membership | None:
    """Return the requesting user's Membership in this project (or None for sys-admin only)."""
    return dynamo.get_membership(project_id, user.id)


def require_project_read(
    project_id: ProjectId = Path(...),
    user: User = Depends(current_user),
    membership: Membership | None = Depends(project_membership),
) -> tuple[User, Membership | None]:
    if not can_read_project(user, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")
    project = dynamo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return user, membership
