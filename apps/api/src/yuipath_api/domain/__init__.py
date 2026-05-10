# SPDX-License-Identifier: Apache-2.0
"""Pure domain logic (no I/O). Ported from mock primitives.jsx."""

from yuipath_api.domain.working_days import add_working_days, is_working_day, working_days_between

__all__ = ["add_working_days", "is_working_day", "working_days_between"]
