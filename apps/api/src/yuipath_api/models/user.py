# SPDX-License-Identifier: Apache-2.0
"""User entity (ADR-0012)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from yuipath_api.models.ids import UserId


class User(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UserId
    email: EmailStr
    display_name: str
    is_system_admin: bool = False
    avatar_url: str | None = None


class UserCreateInput(BaseModel):
    email: EmailStr
    display_name: str
    is_system_admin: bool = False


class UserUpdateInput(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    is_system_admin: bool | None = Field(default=None, description="system_admin only")
