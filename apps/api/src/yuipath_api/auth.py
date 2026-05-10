# SPDX-License-Identifier: Apache-2.0
"""Authentication context resolution.

ADR-0013 commits authentication to AWS-managed (Cognito JWT Authorizer in API
Gateway / OAuth in AgentCore Gateway). We never verify JWTs ourselves — the
authorizer hands us validated claims via the Lambda event context. Locally we
short-circuit with a fixed dev user.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status

from yuipath_api.models import User, UserId
from yuipath_api.settings import settings


def _dev_user() -> User:
    return User(
        id=UserId(settings.dev_user_id),
        email=settings.dev_user_email,  # validated by pydantic via EmailStr field
        display_name="Local Dev",
        is_system_admin=settings.dev_user_is_admin,
    )


def _user_from_claims(claims: dict[str, Any]) -> User:
    sub = claims.get("sub") or claims.get("custom:user_id")
    email = claims.get("email")
    if not sub or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing sub/email in claims",
        )
    return User(
        id=UserId(str(sub)),
        email=str(email),
        display_name=str(claims.get("name") or claims.get("preferred_username") or email),
        is_system_admin=bool(claims.get("custom:is_system_admin")) or False,
    )


def resolve_user(request: Request) -> User:
    """Return the authenticated user for this request.

    - dev mode: fixed user (settings)
    - cognito mode: parse claims surfaced by API Gateway authorizer through Mangum.

    The Mangum adapter places the original event under ``request.scope["aws.event"]``;
    HTTP API v2 claims live at
    ``requestContext.authorizer.jwt.claims``.
    """
    if settings.auth_mode == "dev":
        return _dev_user()

    aws_event: dict[str, Any] | None = request.scope.get("aws.event")
    if not aws_event:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="no authorizer claims (cognito mode requires API Gateway integration)",
        )
    claims: dict[str, Any] = (
        aws_event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    )
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="empty authorizer claims",
        )
    return _user_from_claims(claims)
