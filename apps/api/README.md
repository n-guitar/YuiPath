# yuipath-api

Python FastAPI backend for YuiPath.

## Local development

```bash
cd apps/api
uv sync
uv run uvicorn yuipath_api.main:app --reload
```

Or via docker-compose at the repo root:

```bash
docker-compose up
```

See [ADR-0013](../../docs/adr/0013-architecture-reset.md) for architecture.
