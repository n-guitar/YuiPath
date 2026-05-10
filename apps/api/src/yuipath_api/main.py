# SPDX-License-Identifier: Apache-2.0
"""FastAPI app entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from yuipath_api import __version__
from yuipath_api.settings import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="YuiPath API",
        version=__version__,
        description="YuiPath project management API",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", tags=["meta"])
    async def readyz() -> dict[str, str]:
        return {"status": "ready"}

    return app


app = create_app()
