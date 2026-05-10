# SPDX-License-Identifier: Apache-2.0
"""Membership entity (ADR-0011 / 0012).

Bridges User and Project, carries role + UI metadata (color/capacity/allocation
were ``RESOURCES`` fields in mock; they belong on the Membership because they're
project-scoped).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from yuipath_api.models.ids import ProjectId, UserId


class Role(StrEnum):
    PROJECT_ADMIN = "project_admin"
    PROJECT_MEMBER = "project_member"


class Membership(BaseModel):
    user_id: UserId
    project_id: ProjectId
    role: Role
    color: str = "#94a3b8"  # mock-style hex
    capacity: float = 1.0  # FTE
    allocation: float = 1.0  # how much of capacity this project consumes
    joined_at: datetime


class MembershipCreateInput(BaseModel):
    user_id: UserId
    role: Role
    color: str = "#94a3b8"
    capacity: float = 1.0
    allocation: float = 1.0


class MembershipUpdateInput(BaseModel):
    role: Role | None = None
    color: str | None = None
    capacity: float | None = None
    allocation: float | None = None
    expected_version: int | None = Field(default=None)
