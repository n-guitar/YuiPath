# SPDX-License-Identifier: Apache-2.0
"""DynamoDB single-table key builders (ADR-0002).

| Entity            | PK                       | SK                       | GSI1PK            | GSI1SK            | GSI3PK                              | GSI3SK            |
|-------------------|--------------------------|--------------------------|-------------------|-------------------|-------------------------------------|-------------------|
| User              | USER#<uid>               | USER#<uid>               | USERS             | EMAIL#<email>     | -                                   | -                 |
| Project           | PROJ#<pid>               | PROJ#<pid>               | PROJECTS          | PROJ#<pid>        | -                                   | -                 |
| Membership        | PROJ#<pid>               | MEMBER#<uid>             | USER#<uid>        | PROJ#<pid>        | -                                   | -                 |
| Task              | PROJ#<pid>               | TASK#<tid>               | -                 | -                 | -                                   | -                 |
| Comment           | TASK#<tid>               | COMMENT#<cid>            | -                 | -                 | -                                   | -                 |
| CalendarTemplate  | CAL#<cid>                | CAL#<cid>                | CALENDARS         | CAL#<cid>         | -                                   | -                 |
| Event             | PROJ#<pid>               | EVT#<ts>#<eid>           | -                 | -                 | TARGET#<type>#<id>                  | EVT#<ts>#<eid>    |
"""

from __future__ import annotations

from yuipath_api.models import (
    CalendarId,
    CommentId,
    EventId,
    ProjectId,
    TaskId,
    UserId,
)


def user_pk(user_id: UserId) -> str:
    return f"USER#{user_id}"


def proj_pk(project_id: ProjectId) -> str:
    return f"PROJ#{project_id}"


def task_sk(task_id: TaskId) -> str:
    return f"TASK#{task_id}"


def comment_pk(task_id: TaskId) -> str:
    return f"TASK#{task_id}"


def comment_sk(comment_id: CommentId) -> str:
    return f"COMMENT#{comment_id}"


def member_sk(user_id: UserId) -> str:
    return f"MEMBER#{user_id}"


def calendar_pk(cal_id: CalendarId) -> str:
    return f"CAL#{cal_id}"


def event_sk(ts_iso: str, event_id: EventId) -> str:
    return f"EVT#{ts_iso}#{event_id}"


def target_gsi3_pk(target_type: str, target_id: str) -> str:
    return f"TARGET#{target_type}#{target_id}"
