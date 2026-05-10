# CLAUDE.md

This file is the entry-point guide for Claude Code (and any contributor) working
on this repository. Keep it short and link out.

## TL;DR

- **Architecture**: Web only / Python FastAPI / AWS managed (Cognito + DynamoDB
  + Lambda + CloudFront + AgentCore Gateway). See
  [`docs/adr/0013-architecture-reset.md`](docs/adr/0013-architecture-reset.md).
- **Quickstart**: `docker-compose up`. Details in
  [`docs/dev-guide.md`](docs/dev-guide.md).
- **mock/** is the **UX specification** — do not modify it during
  implementation. The mock CLAUDE-style guide lives at
  [`mock/README.md`](mock/README.md).

## Layout

```
yuipath/
├── apps/
│   ├── web/                # React 19 + Vite + TS (Phase 2)
│   └── api/                # Python FastAPI + boto3 (Phase 1)
├── packages/
│   └── api-client/         # openapi-typescript generated types + fetch wrapper
├── infra/
│   └── cdk/                # AWS CDK NestedStacks (Phase 3)
├── docker-compose.yml      # api + web + dynamodb-local
├── docs/
│   ├── adr/                # Architecture Decision Records
│   ├── dev-guide.md        # Setup + commands
│   ├── ops/                # restore.md, monitoring.md, incident.md
│   ├── security.md
│   └── contributing.md
└── mock/                   # UX spec (frozen)
```

## Conventions

- **CSS prefix**: `pw-` everywhere (legacy from "ProjectWeb" working name).
  Class names are not user-visible; we keep this for now to avoid churn.
- **No fake numbers**: EVM / SPI / CPI / EV / AC are out of scope. Don't
  reintroduce vanity metrics that aren't backed by real data.
- **No AI in core SPA**: AI is BYOC (Bring Your Own Claude) — accessed via
  external MCP clients through AgentCore Gateway. The product itself does
  not embed an LLM dialog UI. See ADR-0012.
- **No MS Project (.mpp) compatibility**: out of scope (ADR-0001/0013).
- **AWS resource IDs are not committed**: pre-commit hook in
  `.githooks/pre-commit` enforces this. Enable with
  `git config core.hooksPath .githooks`.
- **Optimistic locking required on all writes**: `expected_version` is
  required on every PATCH input.

## Key ADRs to read first

- [0013](docs/adr/0013-architecture-reset.md) — current architecture (the
  source of truth for "how is this thing wired").
- [0011](docs/adr/0011-roles-and-permissions.md) — roles
  (system_admin / project_admin / project_member); "own task" = owner OR sub.
- [0012](docs/adr/0012-domain-entities.md) — 7 entities, no AI UI in core,
  Activity Feed = Event Log view.
- [0002](docs/adr/0002-event-log-on-dynamodb.md) — DynamoDB single-table design
  + TTL.
- [0003](docs/adr/0003-ai-via-external-mcp.md) — AI is external MCP only.
- [0004](docs/adr/0004-license-apache-2-with-trademark.md) — Apache 2.0 + brand
  protection.

Superseded ADRs (0001, 0005–0010) are kept as history; do not implement
against them.

## Commands cheat-sheet

```bash
# All-in-one
docker-compose up

# API
cd apps/api
uv run uvicorn yuipath_api.main:app --reload
uv run pytest -q
uv run ruff check . && uv run ruff format --check .
uv run mypy src

# Web
pnpm install
pnpm --filter @yuipath/web dev
pnpm -r typecheck && pnpm -r test
pnpm exec biome check apps/web/src packages

# Infra
pnpm --filter @yuipath/cdk synth
```

## Mock reference

Running the mock (read-only, kept as UX spec):

```bash
cd mock/project
python3 -m http.server 8731
# http://localhost:8731/YuiPath.html
```

## When in doubt

- Check ADR-0013 for "how is this wired"
- Check the mock's README and CLAUDE-style guide for "what should this look/feel like"
- Open an issue tagged `question` if neither answers it.
