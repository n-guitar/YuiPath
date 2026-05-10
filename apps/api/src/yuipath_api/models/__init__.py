# SPDX-License-Identifier: Apache-2.0
"""Domain models (pydantic). 7 entities per ADR-0012."""

from yuipath_api.models.calendar import (
    CalendarCreateInput,
    CalendarTemplate,
    CalendarUpdateInput,
    Holiday,
)
from yuipath_api.models.comment import Comment, CommentCreateInput, CommentUpdateInput
from yuipath_api.models.event import Event, EventKind, TargetRef
from yuipath_api.models.ids import (
    CalendarId,
    CommentId,
    EventId,
    ProjectId,
    TaskId,
    UserId,
)
from yuipath_api.models.membership import (
    Membership,
    MembershipCreateInput,
    MembershipUpdateInput,
    Role,
)
from yuipath_api.models.project import Project, ProjectCreateInput, ProjectUpdateInput
from yuipath_api.models.task import (
    STATUS_PROGRESS,
    Task,
    TaskCreateInput,
    TaskStatus,
    TaskUpdateInput,
)
from yuipath_api.models.user import User, UserCreateInput, UserUpdateInput

__all__ = [
    "STATUS_PROGRESS",
    "CalendarCreateInput",
    "CalendarId",
    "CalendarTemplate",
    "CalendarUpdateInput",
    "Comment",
    "CommentCreateInput",
    "CommentId",
    "CommentUpdateInput",
    "Event",
    "EventId",
    "EventKind",
    "Holiday",
    "Membership",
    "MembershipCreateInput",
    "MembershipUpdateInput",
    "Project",
    "ProjectCreateInput",
    "ProjectId",
    "ProjectUpdateInput",
    "Role",
    "TargetRef",
    "Task",
    "TaskCreateInput",
    "TaskId",
    "TaskStatus",
    "TaskUpdateInput",
    "User",
    "UserCreateInput",
    "UserId",
    "UserUpdateInput",
]
