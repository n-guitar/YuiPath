# SPDX-License-Identifier: Apache-2.0
"""Authorization rules (ADR-0011)."""

from __future__ import annotations

from datetime import UTC, date, datetime

from yuipath_api.models import (
    Membership,
    ProjectId,
    Role,
    Task,
    TaskId,
    TaskStatus,
    User,
    UserId,
)
from yuipath_api.permissions import (
    can_admin_project,
    can_change_task_assignment,
    can_demote_member,
    can_promote_member,
    can_read_project,
    can_write_task,
    is_own_task,
)


def _user(uid: str = "u1", admin: bool = False) -> User:
    return User(
        id=UserId(uid),
        email=f"{uid}@example.com",
        display_name=uid,
        is_system_admin=admin,
    )


def _membership(uid: str = "u1", pid: str = "p1", role: Role = Role.PROJECT_MEMBER) -> Membership:
    return Membership(
        user_id=UserId(uid),
        project_id=ProjectId(pid),
        role=role,
        joined_at=datetime.now(UTC),
    )


def _task(owner: str | None = None, subs: list[str] | None = None, pid: str = "p1") -> Task:
    now = datetime.now(UTC)
    return Task(
        id=TaskId("t1"),
        project_id=ProjectId(pid),
        name="t1",
        start=date(2026, 1, 1),
        end=date(2026, 1, 5),
        duration=5,
        status=TaskStatus.TODO,
        owner=UserId(owner) if owner else None,
        subs=[UserId(s) for s in (subs or [])],
        created_at=now,
        updated_at=now,
    )


def test_read_requires_membership_or_sysadmin() -> None:
    assert can_read_project(_user(), _membership()) is True
    assert can_read_project(_user(), None) is False
    assert can_read_project(_user(admin=True), None) is True


def test_admin_check() -> None:
    assert can_admin_project(_user(), _membership(role=Role.PROJECT_ADMIN)) is True
    assert can_admin_project(_user(), _membership(role=Role.PROJECT_MEMBER)) is False
    assert can_admin_project(_user(admin=True), None) is True


def test_own_task_includes_owner_and_subs() -> None:
    user = _user("u1")
    assert is_own_task(user, _task(owner="u1")) is True
    assert is_own_task(user, _task(owner="u9", subs=["u1"])) is True
    assert is_own_task(user, _task(owner="u9", subs=["u2"])) is False


def test_write_task_admin_or_own() -> None:
    user = _user("u1")
    member = _membership(role=Role.PROJECT_MEMBER)
    admin_m = _membership(role=Role.PROJECT_ADMIN)
    own = _task(owner="u1")
    others = _task(owner="u2")

    assert can_write_task(user, member, own) is True
    assert can_write_task(user, member, others) is False
    assert can_write_task(user, admin_m, others) is True
    assert can_write_task(_user(admin=True), None, others) is True


def test_reassignment_requires_admin() -> None:
    assert can_change_task_assignment(_user(), _membership(role=Role.PROJECT_MEMBER)) is False
    assert can_change_task_assignment(_user(), _membership(role=Role.PROJECT_ADMIN)) is True


def test_promote_disallows_self() -> None:
    actor = _membership("u1", role=Role.PROJECT_ADMIN)
    assert can_promote_member(actor, UserId("u2")) is True
    assert can_promote_member(actor, UserId("u1")) is False


def test_demote_blocks_last_admin() -> None:
    actor = _membership("u1", role=Role.PROJECT_ADMIN)
    target = _membership("u2", role=Role.PROJECT_ADMIN)
    assert can_demote_member(actor, target, other_admins_count=0) is False
    assert can_demote_member(actor, target, other_admins_count=1) is True
