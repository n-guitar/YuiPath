# SPDX-License-Identifier: Apache-2.0
"""Event entity (ADR-0002 / 0012). Audit + activity feed in one log."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from yuipath_api.models.ids import EventId, ProjectId, UserId


class EventKind(StrEnum):
    TASK_CREATED = "task.created"
    TASK_UPDATED = "task.updated"
    TASK_DELETED = "task.deleted"
    COMMENT_CREATED = "comment.created"
    COMMENT_UPDATED = "comment.updated"
    COMMENT_DELETED = "comment.deleted"
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_DELETED = "project.deleted"
    MEMBER_ADDED = "member.added"
    MEMBER_REMOVED = "member.removed"
    MEMBER_ROLE_CHANGED = "member.role_changed"
    CALENDAR_TEMPLATE_CREATED = "calendar_template.created"
    CALENDAR_TEMPLATE_UPDATED = "calendar_template.updated"
    CALENDAR_TEMPLATE_DELETED = "calendar_template.deleted"
    SENSITIVE_READ = "sensitive.read"


class TargetRef(BaseModel):
    type: str  # "task" | "comment" | "project" | "membership" | "calendar"
    id: str


class Event(BaseModel):
    id: EventId
    ts: datetime
    actor: UserId
    project_id: ProjectId
    kind: EventKind
    target: TargetRef | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
