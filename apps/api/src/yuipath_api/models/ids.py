# SPDX-License-Identifier: Apache-2.0
"""Domain ID types (NewType for static typing only).

These are runtime equivalent to ``str``; they exist to make function signatures
self-documenting and to catch ID-shaped mismatches in mypy.
"""

from __future__ import annotations

from typing import NewType

UserId = NewType("UserId", str)
ProjectId = NewType("ProjectId", str)
TaskId = NewType("TaskId", str)
CommentId = NewType("CommentId", str)
CalendarId = NewType("CalendarId", str)
EventId = NewType("EventId", str)
