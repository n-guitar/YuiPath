# SPDX-License-Identifier: Apache-2.0
"""/api/me and other meta endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from yuipath_api.deps import current_user
from yuipath_api.models import User

router = APIRouter(tags=["meta"])


@router.get("/api/me", response_model=User)
def me(user: User = Depends(current_user)) -> User:
    return user
