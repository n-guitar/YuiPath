# SPDX-License-Identifier: Apache-2.0
"""Task entity (ADR-0012).

Tasks unify everything: leaf work, phases (``is_phase``), milestones
(``milestone``), even meetings — all are tasks with flags.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

from yuipath_api.models.ids import ProjectId, TaskId, UserId


class TaskStatus(StrEnum):
    TODO = "todo"
    STARTED = "started"
    IN_PROGRESS_50 = "in-progress-50"
    IN_PROGRESS_80 = "in-progress-80"
    REVIEW = "review"
    DONE = "done"
    BLOCKED = "blocked"


# default progress mapping (mock STATUSES). Used when status changes and progress
# isn't explicitly provided.
STATUS_PROGRESS: dict[TaskStatus, float] = {
    TaskStatus.TODO: 0.0,
    TaskStatus.STARTED: 0.1,
    TaskStatus.IN_PROGRESS_50: 0.5,
    TaskStatus.IN_PROGRESS_80: 0.8,
    TaskStatus.REVIEW: 0.95,
    TaskStatus.DONE: 1.0,
    TaskStatus.BLOCKED: 0.0,
}


class Task(BaseModel):
    id: TaskId
    project_id: ProjectId
    name: str
    description: str = ""
    parent: TaskId | None = None
    is_phase: bool = False
    start: date
    end: date
    duration: int = Field(ge=0, description="working days")
    status: TaskStatus = TaskStatus.TODO
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    owner: UserId | None = None
    subs: list[UserId] = Field(default_factory=list)
    predecessors: list[TaskId] = Field(default_factory=list)
    critical: bool = False
    milestone: bool = False
    depth: int = 0
    version: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _validate_dates(self) -> Task:
        if self.end < self.start:
            raise ValueError("end must be >= start")
        return self


class TaskCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    parent: TaskId | None = None
    is_phase: bool = False
    start: date
    end: date
    duration: int = Field(ge=0)
    status: TaskStatus = TaskStatus.TODO
    progress: float | None = None
    owner: UserId | None = None
    subs: list[UserId] = Field(default_factory=list)
    predecessors: list[TaskId] = Field(default_factory=list)
    milestone: bool = False
    depth: int = 0


class TaskUpdateInput(BaseModel):
    name: str | None = None
    description: str | None = None
    parent: TaskId | None = None
    is_phase: bool | None = None
    start: date | None = None
    end: date | None = None
    duration: int | None = None
    status: TaskStatus | None = None
    progress: float | None = None
    owner: UserId | None = None
    subs: list[UserId] | None = None
    predecessors: list[TaskId] | None = None
    milestone: bool | None = None
    depth: int | None = None
    expected_version: int = Field(description="optimistic locking")
