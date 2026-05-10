# SPDX-License-Identifier: Apache-2.0
"""Test fixtures."""

from __future__ import annotations

import os
from collections.abc import Iterator

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("YUIPATH_AUTH_MODE", "dev")
os.environ.setdefault("YUIPATH_DYNAMODB_ENDPOINT_URL", "")
os.environ.setdefault("YUIPATH_DYNAMODB_TABLE_NAME", "yuipath-test")


@pytest.fixture
def dynamodb_table() -> Iterator[None]:
    with mock_aws():
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName="yuipath-test",
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
                {"AttributeName": "GSI3PK", "AttributeType": "S"},
                {"AttributeName": "GSI3SK", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "GSI3",
                    "KeySchema": [
                        {"AttributeName": "GSI3PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI3SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        from yuipath_api.store import client as store_client

        store_client.reset_cache()
        yield
        store_client.reset_cache()
