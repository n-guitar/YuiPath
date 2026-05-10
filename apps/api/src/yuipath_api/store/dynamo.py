# SPDX-License-Identifier: Apache-2.0
"""DynamoDB single-table CRUD.

Maps pydantic models <-> dynamo items. Keeps boto3 quirks (Decimal, native
JSON serialization) inside this module so the rest of the codebase deals with
plain Python types.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, TypeVar

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from pydantic import BaseModel

from yuipath_api.models import (
    CalendarId,
    CalendarTemplate,
    Comment,
    CommentId,
    Event,
    Membership,
    Project,
    ProjectId,
    Task,
    TaskId,
    User,
    UserId,
)
from yuipath_api.store import keys
from yuipath_api.store.client import get_table

_M = TypeVar("_M", bound=BaseModel)


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, Decimal):
            return float(o) if o % 1 else int(o)
        return super().default(o)


def _to_item(model: BaseModel) -> dict[str, Any]:
    raw = json.loads(model.model_dump_json())
    coerced: dict[str, Any] = _coerce_for_dynamo(raw)
    return coerced


def _coerce_for_dynamo(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _coerce_for_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_coerce_for_dynamo(v) for v in value]
    return value


def _from_item(item: dict[str, Any], model: type[_M]) -> _M:
    payload = json.loads(json.dumps(item, cls=_DecimalEncoder))
    for k in ("PK", "SK", "GSI1PK", "GSI1SK", "GSI3PK", "GSI3SK", "ttl"):
        payload.pop(k, None)
    return model.model_validate(payload)


class VersionConflict(Exception):
    """Optimistic-locking failure."""


class NotFound(Exception):
    pass


def _conflict() -> Exception:
    return VersionConflict()


# ---------- USER ----------


def put_user(user: User) -> None:
    item = _to_item(user)
    item["PK"] = keys.user_pk(user.id)
    item["SK"] = keys.user_pk(user.id)
    item["GSI1PK"] = "USERS"
    item["GSI1SK"] = f"EMAIL#{user.email}"
    get_table().put_item(Item=item)


def get_user(user_id: UserId) -> User | None:
    resp = get_table().get_item(Key={"PK": keys.user_pk(user_id), "SK": keys.user_pk(user_id)})
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, User)


# ---------- PROJECT ----------


def put_project(project: Project, *, expected_version: int | None = None) -> Project:
    pk = keys.proj_pk(project.id)
    item = _to_item(project)
    item["PK"] = pk
    item["SK"] = pk
    item["GSI1PK"] = "PROJECTS"
    item["GSI1SK"] = pk

    if expected_version is None:
        get_table().put_item(Item=item)
        return project
    try:
        get_table().put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK) OR version = :v",
            ExpressionAttributeValues={":v": expected_version},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise _conflict() from e
        raise
    return project


def get_project(project_id: ProjectId) -> Project | None:
    pk = keys.proj_pk(project_id)
    resp = get_table().get_item(Key={"PK": pk, "SK": pk})
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, Project)


def list_projects() -> list[Project]:
    resp = get_table().query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq("PROJECTS"),
    )
    return [_from_item(it, Project) for it in resp.get("Items", [])]


def delete_project(project_id: ProjectId) -> None:
    pk = keys.proj_pk(project_id)
    get_table().delete_item(Key={"PK": pk, "SK": pk})


# ---------- MEMBERSHIP ----------


def put_membership(membership: Membership) -> None:
    item = _to_item(membership)
    item["PK"] = keys.proj_pk(membership.project_id)
    item["SK"] = keys.member_sk(membership.user_id)
    item["GSI1PK"] = keys.user_pk(membership.user_id)
    item["GSI1SK"] = keys.proj_pk(membership.project_id)
    get_table().put_item(Item=item)


def get_membership(project_id: ProjectId, user_id: UserId) -> Membership | None:
    resp = get_table().get_item(Key={"PK": keys.proj_pk(project_id), "SK": keys.member_sk(user_id)})
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, Membership)


def list_memberships_in_project(project_id: ProjectId) -> list[Membership]:
    resp = get_table().query(
        KeyConditionExpression=Key("PK").eq(keys.proj_pk(project_id))
        & Key("SK").begins_with("MEMBER#"),
    )
    return [_from_item(it, Membership) for it in resp.get("Items", [])]


def list_projects_for_user(user_id: UserId) -> list[ProjectId]:
    resp = get_table().query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(keys.user_pk(user_id))
        & Key("GSI1SK").begins_with("PROJ#"),
    )
    return [ProjectId(it["GSI1SK"].split("#", 1)[1]) for it in resp.get("Items", [])]


def delete_membership(project_id: ProjectId, user_id: UserId) -> None:
    get_table().delete_item(Key={"PK": keys.proj_pk(project_id), "SK": keys.member_sk(user_id)})


# ---------- TASK ----------


def put_task(task: Task, *, expected_version: int | None = None) -> Task:
    item = _to_item(task)
    item["PK"] = keys.proj_pk(task.project_id)
    item["SK"] = keys.task_sk(task.id)

    if expected_version is None:
        get_table().put_item(Item=item)
        return task
    try:
        get_table().put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK) OR version = :v",
            ExpressionAttributeValues={":v": expected_version},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise _conflict() from e
        raise
    return task


def get_task(project_id: ProjectId, task_id: TaskId) -> Task | None:
    resp = get_table().get_item(Key={"PK": keys.proj_pk(project_id), "SK": keys.task_sk(task_id)})
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, Task)


def list_tasks(project_id: ProjectId) -> list[Task]:
    resp = get_table().query(
        KeyConditionExpression=Key("PK").eq(keys.proj_pk(project_id))
        & Key("SK").begins_with("TASK#"),
    )
    return [_from_item(it, Task) for it in resp.get("Items", [])]


def delete_task(project_id: ProjectId, task_id: TaskId) -> None:
    get_table().delete_item(Key={"PK": keys.proj_pk(project_id), "SK": keys.task_sk(task_id)})


# ---------- COMMENT ----------


def put_comment(comment: Comment, *, expected_version: int | None = None) -> Comment:
    item = _to_item(comment)
    item["PK"] = keys.comment_pk(comment.task_id)
    item["SK"] = keys.comment_sk(comment.id)

    if expected_version is None:
        get_table().put_item(Item=item)
        return comment
    try:
        get_table().put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK) OR version = :v",
            ExpressionAttributeValues={":v": expected_version},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise _conflict() from e
        raise
    return comment


def get_comment(task_id: TaskId, comment_id: CommentId) -> Comment | None:
    resp = get_table().get_item(
        Key={"PK": keys.comment_pk(task_id), "SK": keys.comment_sk(comment_id)}
    )
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, Comment)


def list_comments(task_id: TaskId) -> list[Comment]:
    resp = get_table().query(
        KeyConditionExpression=Key("PK").eq(keys.comment_pk(task_id))
        & Key("SK").begins_with("COMMENT#"),
    )
    return [_from_item(it, Comment) for it in resp.get("Items", [])]


def delete_comment(task_id: TaskId, comment_id: CommentId) -> None:
    get_table().delete_item(Key={"PK": keys.comment_pk(task_id), "SK": keys.comment_sk(comment_id)})


# ---------- CALENDAR ----------


def put_calendar(cal: CalendarTemplate, *, expected_version: int | None = None) -> CalendarTemplate:
    pk = keys.calendar_pk(cal.id)
    item = _to_item(cal)
    item["PK"] = pk
    item["SK"] = pk
    item["GSI1PK"] = "CALENDARS"
    item["GSI1SK"] = pk

    if expected_version is None:
        get_table().put_item(Item=item)
        return cal
    try:
        get_table().put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK) OR version = :v",
            ExpressionAttributeValues={":v": expected_version},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise _conflict() from e
        raise
    return cal


def get_calendar(cal_id: CalendarId) -> CalendarTemplate | None:
    pk = keys.calendar_pk(cal_id)
    resp = get_table().get_item(Key={"PK": pk, "SK": pk})
    item = resp.get("Item")
    if not item:
        return None
    return _from_item(item, CalendarTemplate)


def list_calendars() -> list[CalendarTemplate]:
    resp = get_table().query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq("CALENDARS"),
    )
    return [_from_item(it, CalendarTemplate) for it in resp.get("Items", [])]


def delete_calendar(cal_id: CalendarId) -> None:
    pk = keys.calendar_pk(cal_id)
    get_table().delete_item(Key={"PK": pk, "SK": pk})


# ---------- EVENT ----------


def put_event(event: Event) -> None:
    item = _to_item(event)
    pk = keys.proj_pk(event.project_id)
    item["PK"] = pk
    item["SK"] = keys.event_sk(event.ts.isoformat(), event.id)
    if event.target:
        item["GSI3PK"] = keys.target_gsi3_pk(event.target.type, event.target.id)
        item["GSI3SK"] = keys.event_sk(event.ts.isoformat(), event.id)
    get_table().put_item(Item=item)


def list_events_by_project(project_id: ProjectId, limit: int = 100) -> list[Event]:
    resp = get_table().query(
        KeyConditionExpression=Key("PK").eq(keys.proj_pk(project_id))
        & Key("SK").begins_with("EVT#"),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [_from_item(it, Event) for it in resp.get("Items", [])]


def list_events_by_target(target_type: str, target_id: str, limit: int = 100) -> list[Event]:
    resp = get_table().query(
        IndexName="GSI3",
        KeyConditionExpression=Key("GSI3PK").eq(keys.target_gsi3_pk(target_type, target_id))
        & Key("GSI3SK").begins_with("EVT#"),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [_from_item(it, Event) for it in resp.get("Items", [])]
