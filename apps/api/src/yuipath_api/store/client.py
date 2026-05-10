# SPDX-License-Identifier: Apache-2.0
"""boto3 DynamoDB client / resource factory.

env-driven endpoint switch (DynamoDB Local vs AWS) per ADR-0013.
"""

from __future__ import annotations

from functools import cache
from typing import Any

import boto3

from yuipath_api.settings import settings


@cache
def get_table() -> Any:
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.dynamodb_endpoint_url:
        kwargs["endpoint_url"] = settings.dynamodb_endpoint_url
    resource = boto3.resource("dynamodb", **kwargs)
    return resource.Table(settings.dynamodb_table_name)


def reset_cache() -> None:
    get_table.cache_clear()
