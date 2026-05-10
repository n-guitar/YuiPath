# SPDX-License-Identifier: Apache-2.0
"""Configuration via environment variables (pydantic-settings)."""

from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="YUIPATH_", env_file=".env", extra="ignore")

    # Auth
    auth_mode: Literal["dev", "cognito"] = "dev"
    dev_user_id: str = "local-user"
    dev_user_email: str = "dev@yuipath.local"
    dev_user_is_admin: bool = True

    # DynamoDB
    dynamodb_table_name: str = "yuipath-dev"
    dynamodb_endpoint_url: str | None = None  # AWS: leave None; local: http://dynamodb-local:8000
    aws_region: str = "us-east-1"

    # CORS
    cors_allow_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
