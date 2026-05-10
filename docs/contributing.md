# Contributing to YuiPath

Thanks for considering a contribution. YuiPath is intentionally small and
opinionated; we keep the contribution barrier low and the core focused.

## Quickstart

```bash
git clone https://github.com/n-guitar/yuipath.git
cd yuipath
git config core.hooksPath .githooks
docker-compose up
```

That gives you the full stack on `http://localhost:5173` (web) +
`http://localhost:8000` (API). See [`docs/dev-guide.md`](./dev-guide.md).

## Before opening a PR

1. **Read the relevant ADR.** All architectural decisions live in
   [`docs/adr/`](./adr/). [ADR-0013](./adr/0013-architecture-reset.md) is the
   current architecture; superseded ADRs are kept as history.
2. **Tests pass locally**:
   - `cd apps/api && uv run pytest -q`
   - `pnpm -r test`
3. **Lint/type clean**:
   - `cd apps/api && uv run ruff check . && uv run mypy src`
   - `pnpm -r typecheck`
   - `pnpm exec biome check apps/web/src packages`
4. **CI is green** in the PR.

## What we do / don't accept

**Yes**:
- Bug fixes (with a regression test).
- mock UX → React/TS migration of unported screens (Calendar / Gantt /
  Resources / drawers / detector framework).
- Performance fixes for measurable hot paths.
- Documentation improvements.
- New ADRs for cross-cutting changes.

**Probably yes, but discuss first via issue**:
- New entity types (mock currently has 7 — see ADR-0012 for what's *not* in scope).
- New auth modes (we currently support dev + Cognito).
- Additional storage backends.

**No**:
- AI features in the core SPA (ADR-0012 — AI is BYOC, accessed via MCP only).
- MS Project (.mpp) compatibility (ADR-0001 / 0013 — out of scope).
- EVM / SPI / CPI metrics that aren't supported by real data.

## Branch & commit style

- Branch from `main`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Each commit should be self-contained where reasonable; large mechanical
  refactors can be split into a chain of commits in one PR.

## Trademark

Code is Apache 2.0 but the YuiPath name and logo are protected; see
[`TRADEMARKS.md`](../TRADEMARKS.md) before redistributing.
