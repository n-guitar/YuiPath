# SPDX-License-Identifier: Apache-2.0
"""Event Log writer (ADR-0002 / 0012).

Every mutating route appends an Event after the write succeeds. Activity Feed
in the SPA reads from the same log (no separate store).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from yuipath_api.models import Event, EventId, EventKind, ProjectId, TargetRef, UserId
from yuipath_api.store import dynamo


def append(
    *,
    actor: UserId,
    project_id: ProjectId,
    kind: EventKind,
    target: TargetRef | None = None,
    payload: dict[str, Any] | None = None,
) -> Event:
    event = Event(
        id=EventId(str(uuid.uuid4())),
        ts=datetime.now(UTC),
        actor=actor,
        project_id=project_id,
        kind=kind,
        target=target,
        payload=payload or {},
    )
    dynamo.put_event(event)
    return event
