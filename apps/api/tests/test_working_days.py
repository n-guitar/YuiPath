# SPDX-License-Identifier: Apache-2.0
"""Working-day arithmetic tests."""

from __future__ import annotations

from datetime import UTC, date, datetime

from yuipath_api.domain import add_working_days, is_working_day, working_days_between
from yuipath_api.models import CalendarId, CalendarTemplate, Holiday


def _cal(holidays: list[Holiday] | None = None) -> CalendarTemplate:
    now = datetime.now(UTC)
    return CalendarTemplate(
        id=CalendarId("test"),
        name="default",
        working_days=[False, True, True, True, True, True, False],
        holidays=holidays or [],
        created_at=now,
        updated_at=now,
    )


def test_default_calendar_skips_weekends() -> None:
    assert is_working_day(date(2026, 6, 12)) is True
    assert is_working_day(date(2026, 6, 13)) is False
    assert is_working_day(date(2026, 6, 14)) is False
    assert is_working_day(date(2026, 6, 15)) is True


def test_holidays_excluded() -> None:
    cal = _cal(holidays=[Holiday(date=date(2026, 6, 12), name="Founders day")])
    assert is_working_day(date(2026, 6, 12), cal) is False
    assert is_working_day(date(2026, 6, 11), cal) is True


def test_working_days_between_inclusive() -> None:
    assert working_days_between(date(2026, 6, 15), date(2026, 6, 19)) == 5


def test_working_days_between_skips_weekend() -> None:
    assert working_days_between(date(2026, 6, 12), date(2026, 6, 15)) == 2


def test_add_working_days_zero_returns_start() -> None:
    assert add_working_days(date(2026, 6, 15), 0) == date(2026, 6, 15)


def test_add_working_days_skips_weekend() -> None:
    assert add_working_days(date(2026, 6, 12), 2) == date(2026, 6, 15)


def test_add_working_days_with_holiday() -> None:
    cal = _cal(holidays=[Holiday(date=date(2026, 6, 16), name="x")])
    assert add_working_days(date(2026, 6, 15), 2, cal) == date(2026, 6, 17)
