# SPDX-License-Identifier: Apache-2.0
"""Project entity (ADR-0012)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from yuipath_api.models.ids import CalendarId, ProjectId


class Project(BaseModel):
    id: ProjectId
    name: str
    description: str = ""
    calendar_template_id: CalendarId | None = None
    version: int = 0
    created_at: datetime
    updated_at: datetime


class ProjectCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    calendar_template_id: CalendarId | None = None


class ProjectUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    calendar_template_id: CalendarId | None = None
    expected_version: int = Field(description="optimistic locking; must match current version")
