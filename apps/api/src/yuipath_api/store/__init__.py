# SPDX-License-Identifier: Apache-2.0
"""DynamoDB single-table store (ADR-0002)."""

from yuipath_api.store import dynamo, keys
from yuipath_api.store.dynamo import NotFound, VersionConflict

__all__ = ["NotFound", "VersionConflict", "dynamo", "keys"]
