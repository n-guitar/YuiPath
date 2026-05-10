# Development guide

## Quickstart

```bash
git clone https://github.com/n-guitar/yuipath.git
cd yuipath

# enable AWS-ID / secret pre-commit hook
git config core.hooksPath .githooks

# all-in-one local stack
docker-compose up
# → API   http://localhost:8000   (FastAPI + uvicorn, hot reload)
# → web   http://localhost:5173   (Vite dev server, /api proxied to API)
# → DDB   http://localhost:8001   (DynamoDB Local; table is auto-created on boot)
```

## Without docker (per-service)

### API (Python / FastAPI)

```bash
cd apps/api
uv sync --all-extras
uv run uvicorn yuipath_api.main:app --reload
```

### Web (Vite / React)

```bash
pnpm install            # at repo root
pnpm --filter @yuipath/web dev
```

### Infra (CDK)

```bash
pnpm install
pnpm --filter @yuipath/cdk synth   # checks compile + synth
```

## Configuration (env)

The API reads env vars prefixed `YUIPATH_`:

| Env | Values | Default | Effect |
|---|---|---|---|
| `YUIPATH_AUTH_MODE` | `dev` / `cognito` | `dev` | dev: fixed admin user. cognito: read claims from API Gateway authorizer. |
| `YUIPATH_DYNAMODB_ENDPOINT_URL` | URL or empty | empty | empty → AWS default. Local: `http://dynamodb-local:8000`. |
| `YUIPATH_DYNAMODB_TABLE_NAME` | string | `yuipath-dev` | DynamoDB single-table name (ADR-0002). |
| `YUIPATH_AWS_REGION` | region | `us-east-1` | AWS region. |
| `YUIPATH_CORS_ALLOW_ORIGINS` | JSON list | `["http://localhost:5173"]` | Browser CORS allow list. |

## Test / Lint

```bash
# API
cd apps/api && uv run pytest -q
cd apps/api && uv run ruff check . && uv run ruff format --check .
cd apps/api && uv run mypy src

# Web
pnpm -r typecheck
pnpm -r test
pnpm exec biome check apps/web/src packages

# Infra
pnpm --filter @yuipath/cdk typecheck
```

## Architecture

See [ADR-0013](./adr/0013-architecture-reset.md) for the current architecture and
[docs/adr/](./adr/) for all decisions.

The mock under `mock/` is a UX specification — do not modify it during implementation.
