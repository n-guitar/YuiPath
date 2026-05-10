# SPDX-License-Identifier: Apache-2.0
"""Working-day arithmetic.

Ported from mock/project/primitives.jsx (``isWorkingDay`` / ``workingDaysBetween``
/ ``addWorkingDays``). Logic stays identical so existing UX expectations hold.
"""

from __future__ import annotations

from datetime import date, timedelta

from yuipath_api.models.calendar import CalendarTemplate, Holiday

# Default mon-fri calendar when CalendarTemplate is missing.
_DEFAULT_WORKING = [False, True, True, True, True, True, False]


def _holidays_set(holidays: list[Holiday] | None) -> set[date]:
    if not holidays:
        return set()
    return {h.date for h in holidays}


def is_working_day(d: date, calendar: CalendarTemplate | None = None) -> bool:
    """True iff ``d`` is a working day under ``calendar`` (or the default cal)."""
    working = calendar.working_days if calendar else _DEFAULT_WORKING
    holidays = _holidays_set(calendar.holidays if calendar else None)
    if d in holidays:
        return False
    weekday_index = (d.weekday() + 1) % 7  # Mon=0 → Sun=0 indexing
    return working[weekday_index]


def working_days_between(start: date, end: date, calendar: CalendarTemplate | None = None) -> int:
    """Count working days in ``[start, end]`` inclusive. ≥1 when start==end on a working day."""
    if end < start:
        return 0
    count = 0
    cur = start
    while cur <= end:
        if is_working_day(cur, calendar):
            count += 1
        cur += timedelta(days=1)
    return count


def add_working_days(
    start: date, n_working_days: int, calendar: CalendarTemplate | None = None
) -> date:
    """Return ``start + n working days`` (counting ``start`` as day 1 if working)."""
    if n_working_days < 0:
        raise ValueError("n_working_days must be >= 0")
    if n_working_days == 0:
        return start

    cur = start
    remaining = n_working_days
    if is_working_day(cur, calendar):
        remaining -= 1
    while remaining > 0:
        cur += timedelta(days=1)
        if is_working_day(cur, calendar):
            remaining -= 1
    return cur
