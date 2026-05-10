# SPDX-License-Identifier: Apache-2.0
"""CalendarTemplate CRUD (global; not project-scoped)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, status

from yuipath_api.deps import current_user
from yuipath_api.models import (
    CalendarCreateInput,
    CalendarId,
    CalendarTemplate,
    CalendarUpdateInput,
    User,
)
from yuipath_api.store import VersionConflict, dynamo

router = APIRouter(prefix="/api/calendar-templates", tags=["calendars"])


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("", response_model=list[CalendarTemplate])
def list_calendars(_: User = Depends(current_user)) -> list[CalendarTemplate]:
    return dynamo.list_calendars()


@router.post("", response_model=CalendarTemplate, status_code=status.HTTP_201_CREATED)
def create_calendar(
    body: CalendarCreateInput, user: User = Depends(current_user)
) -> CalendarTemplate:
    if not user.is_system_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system_admin required")
    cid = CalendarId(str(uuid.uuid4()))
    now = _now()
    cal = CalendarTemplate(
        id=cid,
        name=body.name,
        working_days=body.working_days
        if body.working_days is not None
        else [False, True, True, True, True, True, False],
        holidays=body.holidays,
        version=0,
        created_at=now,
        updated_at=now,
    )
    dynamo.put_calendar(cal)
    return cal


@router.get("/{cal_id}", response_model=CalendarTemplate)
def get_calendar(
    cal_id: CalendarId = Path(...), _: User = Depends(current_user)
) -> CalendarTemplate:
    cal = dynamo.get_calendar(cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return cal


@router.patch("/{cal_id}", response_model=CalendarTemplate)
def update_calendar(
    body: CalendarUpdateInput,
    cal_id: CalendarId = Path(...),
    user: User = Depends(current_user),
) -> CalendarTemplate:
    if not user.is_system_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system_admin required")
    current = dynamo.get_calendar(cal_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if current.version != body.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict")
    updated = current.model_copy(
        update={
            "name": body.name if body.name is not None else current.name,
            "working_days": body.working_days
            if body.working_days is not None
            else current.working_days,
            "holidays": body.holidays if body.holidays is not None else current.holidays,
            "version": current.version + 1,
            "updated_at": _now(),
        }
    )
    try:
        dynamo.put_calendar(updated, expected_version=current.version)
    except VersionConflict as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version conflict") from e
    return updated


@router.delete("/{cal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar(cal_id: CalendarId = Path(...), user: User = Depends(current_user)) -> None:
    if not user.is_system_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="system_admin required")
    if dynamo.get_calendar(cal_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    dynamo.delete_calendar(cal_id)
