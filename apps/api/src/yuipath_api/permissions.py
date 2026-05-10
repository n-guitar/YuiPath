# SPDX-License-Identifier: Apache-2.0
"""Authorization (ADR-0011).

The whole policy fits in a few rules:

* Read = soft (project membership OR system_admin can read everything in the project).
* Write own = ``task.owner == self`` OR ``self in task.subs``.
* Write any = project_admin in this project; system_admin globally.
* Reassign owner / subs to a different user = admin only.
* Promotion to admin = admin only (and never self-promotion).
* Last admin (per project / globally) cannot be demoted or removed.
"""

from __future__ import annotations

from yuipath_api.models import Membership, Role, Task, User, UserId


def can_read_project(user: User, membership: Membership | None) -> bool:
    return user.is_system_admin or membership is not None


def can_admin_project(user: User, membership: Membership | None) -> bool:
    if user.is_system_admin:
        return True
    return membership is not None and membership.role == Role.PROJECT_ADMIN


def is_own_task(user: User, task: Task) -> bool:
    """ADR-0011: 'own' = owner OR sub. Subs are intentionally included."""
    return task.owner == user.id or user.id in task.subs


def can_write_task(user: User, membership: Membership | None, task: Task) -> bool:
    if can_admin_project(user, membership):
        return True
    if membership is None:
        return False
    return is_own_task(user, task)


def can_change_task_assignment(user: User, membership: Membership | None) -> bool:
    """Reassigning owner / subs to ANOTHER user is admin-only.

    A member can still drop themselves from owner/subs (handled at the route level
    by comparing before/after).
    """
    return can_admin_project(user, membership)


def can_demote_member(
    actor_membership: Membership,
    target_membership: Membership,
    other_admins_count: int,
) -> bool:
    """Demote ``target`` from project_admin to project_member.

    Rules:
    - actor must be admin (callers should already check this).
    - if target is the last admin in the project, refuse.
    - actors can demote themselves IFF other admins remain.
    """
    if target_membership.role != Role.PROJECT_ADMIN:
        return False
    if other_admins_count == 0:
        return False
    return actor_membership.role == Role.PROJECT_ADMIN


def can_promote_member(
    actor_membership: Membership,
    target_user_id: UserId,
) -> bool:
    """Promote target → project_admin. Never self.

    Caller must additionally verify actor is admin.
    """
    if actor_membership.user_id == target_user_id:
        return False
    return actor_membership.role == Role.PROJECT_ADMIN


def can_grant_system_admin(actor: User) -> bool:
    return actor.is_system_admin


def can_remove_system_admin(actor: User, target_user_id: UserId, other_sysadmin_count: int) -> bool:
    if not actor.is_system_admin:
        return False
    if actor.id == target_user_id:
        return other_sysadmin_count > 0
    return True
