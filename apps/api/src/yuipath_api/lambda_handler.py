# SPDX-License-Identifier: Apache-2.0
"""AWS Lambda entry point (Mangum adapter for the FastAPI app).

Used by Phase 3 CDK to wire API Gateway → Lambda. Locally we still run uvicorn
directly via docker-compose; this module is only loaded under Lambda.
"""

from __future__ import annotations

from mangum import Mangum

from yuipath_api.main import app

handler = Mangum(app, lifespan="off")
