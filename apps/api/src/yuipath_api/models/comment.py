# SPDX-License-Identifier: Apache-2.0
"""Comment entity (ADR-0012). Comments are attached to tasks only."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from yuipath_api.models.ids import CommentId, TaskId, UserId


class Comment(BaseModel):
    id: CommentId
    task_id: TaskId
    author_id: UserId
    body: str
    version: int = 0
    created_at: datetime
    updated_at: datetime


class CommentCreateInput(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class CommentUpdateInput(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    expected_version: int
