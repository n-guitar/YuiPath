# SPDX-License-Identifier: Apache-2.0
"""CalendarTemplate entity (ADR-0012). Working-day template + holidays."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from yuipath_api.models.ids import CalendarId


class Holiday(BaseModel):
    date: date
    name: str = ""


class CalendarTemplate(BaseModel):
    id: CalendarId
    name: str
    # 7 booleans, [Sun, Mon, Tue, Wed, Thu, Fri, Sat]; index = (date.weekday()+1) % 7.
    working_days: list[bool] = Field(
        default_factory=lambda: [False, True, True, True, True, True, False]
    )
    holidays: list[Holiday] = Field(default_factory=list)
    version: int = 0
    created_at: datetime
    updated_at: datetime

    @field_validator("working_days")
    @classmethod
    def _seven(cls, v: list[bool]) -> list[bool]:
        if len(v) != 7:
            raise ValueError("working_days must be a 7-element list (Sun..Sat)")
        return v


class CalendarCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    working_days: list[bool] | None = None
    holidays: list[Holiday] = Field(default_factory=list)


class CalendarUpdateInput(BaseModel):
    name: str | None = None
    working_days: list[bool] | None = None
    holidays: list[Holiday] | None = None
    expected_version: int
