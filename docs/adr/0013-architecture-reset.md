# 0013: アーキテクチャリセット (Web only / Python FastAPI / AWS managed)

- Status: Proposed
- Date: 2026-05-09
- Supersedes: ADR-0001, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0010

## Context

本プロジェクトは当初 ADR-0001 で「Pattern A (Tauri デスクトップ) + Pattern B (AWS) 並行サポート」を前提に置き、ADR-0005/0006/0007/0008 で Rust crate 群と Cargo+pnpm monorepo、ADR-0009 で Strands Agents、ADR-0010 で operation map ベースの自前 MCP サーバーを設計してきた。

mock 分析 (2026-05-09) と直接対話で以下が判明:

1. **「ローカル」は Tauri デスクトップではなく「Web アプリをローカルでも動かす」の意味だった** — Pattern A (Tauri) は不要
2. **言語は Python (FastAPI) でよい** — Rust の型安全より「シンプル」を優先
3. **AI/LLM 機能は本体に UI を持たない** (ADR-0012) — サーバー側 LLM 推論は不要
4. **AWS マネージドに頼って良い** — JWT 検証や MCP プロトコル処理を自前実装より managed を採用

これにより 7 つの ADR の前提が崩れたため、本 ADR で全体を再設計する。

## Decision

### 全体像

```
[Browser SPA]                   [MCP client (Claude Desktop / Code 他)]
     │                                  │
     ▼                                  ▼
[CloudFront + WAF]              [AgentCore Gateway]
     │                            OAuth (Cognito) + MCP変換 (managed)
     ├─ /         → S3                  │
     └─ /api/*    → API Gateway HTTP API + Cognito JWT Authorizer (managed)
                       │                │
                       ▼                ▼
                  [Lambda + Python FastAPI]
                       │
                       ▼
                  [DynamoDB]

[Local dev / self-host]
  docker-compose up:
    ├─ FastAPI container (uvicorn)
    ├─ DynamoDB Local
    └─ Vite dev server (frontend)
  Auth: env=dev で固定ユーザーモード
  MCP : fastapi-mcp で同 endpoint を MCP exposure
```

### Stack

| 領域 | 技術 |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Python FastAPI (uvicorn) |
| Storage | DynamoDB (AWS) / DynamoDB Local (local) |
| Auth | Cognito User Pool + Hosted UI (AWS) / dev token (local) |
| MCP exposure | AgentCore Gateway (AWS) / fastapi-mcp library (local) |
| API client | openapi-typescript (FastAPI 出力 OpenAPI から生成) |
| Infra | AWS CDK (TypeScript) |
| Package mgmt | pnpm (frontend / infra) + uv (backend) |

### 設計の 5 本柱

**1. Web only、コード 1 本**
- Tauri / SQLite / Rust / WASM は採用しない
- Backend は Python FastAPI 1 つ。env で local / AWS を切り替え

**2. AWS マネージドに認証を委譲**
- 自前で JWT 検証コードを書かない
- API Gateway HTTP API + Cognito JWT Authorizer が認証を担当
- AgentCore Gateway が MCP 経由の OAuth フローを担当
- 我々のコードは検証済み claims から user を取り出すだけ

**3. OpenAPI が source of truth**
- FastAPI が REST endpoint と OpenAPI を持つ
- Browser 用 TS client は openapi-typescript で生成
- MCP は AgentCore Gateway が OpenAPI → MCP tools 自動変換
- 別途 codegen 層を書かない (ADR-0008 不要)

**4. 認証 (who) と認可 (what) を分離**
- 認証 = AWS 完全マネージド (Cognito + Gateway)
- 認可 = 我々の handler 層 (ADR-0011 のロール check、ADR-0012 のドメイン)

**5. 1 backend = 1 コードベース**
- DynamoDB のみ採用。Storage trait 抽象は不要
- 接続先を env (`DYNAMODB_ENDPOINT_URL`) で切替

### Repo layout

```
yuipath/
├── apps/
│   ├── web/                # React + Vite SPA (mock 移植)
│   └── api/                # Python FastAPI app
├── packages/
│   └── api-client/         # openapi-typescript で自動生成
├── infra/
│   └── cdk/                # AWS CDK (TypeScript)
├── docker-compose.yml      # ローカル統合起動
├── docs/adr/
├── pnpm-workspace.yaml
├── pyproject.toml          # uv (apps/api)
└── mock/                   # UX spec として保持
```

### Auth フロー

**Browser**:
1. Cognito Hosted UI でログイン → JWT 取得
2. `Authorization: Bearer <JWT>` で API Gateway を叩く
3. Cognito JWT Authorizer が検証 → 検証済 claims が Lambda に渡る
4. FastAPI が claims から user を組み立てる
5. ロール check (ADR-0011) を handler で実行

**MCP client**:
1. Claude Desktop が AgentCore Gateway URL に接続
2. Gateway が OAuth 2.1 メタデータを返す
3. Claude Desktop が Cognito でログイン → JWT 取得
4. Gateway が JWT を検証 → REST API として Lambda を叩く
5. Lambda は Browser 経路と同じ FastAPI handler を実行

### Local dev mode

```python
if AUTH_MODE == "dev":
    user = User(id="local-user", is_system_admin=True)
else:
    # AWS では Authorizer が検証済み claims を渡してくる
    user = User.from_claims(request.scope["aws.event"]["requestContext"]["authorizer"]["jwt"]["claims"])
```

ローカルは「自分で守る前提」で簡素化。脆弱性面は AWS デプロイで担保。

### Phase 構成 (改訂)

| Phase | 内容 |
|---|---|
| 0 | Foundation: pnpm + uv workspace, CI, license, docker-compose 雛形 |
| 1 | Python FastAPI core: 7 entities (ADR-0012) + role check (ADR-0011) + DynamoDB アクセス + Event Log writer + REST endpoint + OpenAPI 自動出力 |
| 2 | Frontend migration: mock JSX → React/TS、openapi-typescript で API client |
| 3 | AWS deploy: CDK + Cognito + API Gateway + AgentCore Gateway + Lambda + CloudFront |
| 4 | 運用: WAF / monitoring / バックアップ / ドキュメント / 配布 |

旧 Phase 5 (yuipath-mcp / Strands) は廃止。

## Consequences

### Positive
- 自前実装する量 = FastAPI app + React SPA のみ
- AWS が認証 / MCP プロトコル / observability の責任を持つ
- mock の UX 仕様と整合
- Phase 構成が縮小 (5 → 4)
- ローカル開発が `docker-compose up` 1 行
- ADR-0011 (ロール) と ADR-0012 (エンティティ) はドメインモデルとして残るので議論積み立てが無駄にならない
- mock はそのまま UX 仕様として保持

### Negative
- AWS lock-in (AgentCore / Cognito / API Gateway / DynamoDB)
- AgentCore Gateway は 2025 GA、API 変更リスクあり
- ローカルと AWS で MCP exposure 経路が異なる (fastapi-mcp vs Gateway) → 振る舞い差異の可能性
- Rust の型安全 / 性能優位は捨てる
- Python の型 hint だけで型整合を保つ (mypy + pydantic で補強する想定)

### Risk mitigation
- AgentCore Gateway 仕様変更: OpenAPI が真実なので Gateway 側の infra コード調整で済む
- ローカル/AWS 経路差異: 統合テストを AWS dev 環境で必ず実行
- Python 型ズレ: pydantic + mypy + pytest で防御

## What survives from prior ADRs

| ADR | 状態 | 備考 |
|---|---|---|
| 0002 (Event Log on DynamoDB) | 残存 | スキーマ設計はそのまま、実装が Python に変わる |
| 0003 (AI external) | 残存 | 「AI は MCP 経由で外部クライアント」を再確認。サーバー側 LLM はなし (BYOC) |
| 0004 (License) | 残存 | Apache 2.0 + 商標保護 |
| 0011 (Roles) | 残存 (Python 表現に調整) | ロール 3 つ、ガード 2 つ。実装が Rust → Python |
| 0012 (Domain entities) | 残存 (Python 表現に調整) | 7 entities。実装が Rust → Python |

## What is superseded

| ADR | 理由 |
|---|---|
| 0001 (Pattern A/B) | Pattern A (Tauri) を捨てたため両建て不要 |
| 0005 (Cargo + pnpm monorepo) | Cargo workspace 不要、pnpm + uv に簡素化 |
| 0006 (Storage trait Rust) | 1 backend (DynamoDB) なので trait 抽象不要 |
| 0007 (cargo-lambda + LocalStack) | Python + DynamoDB Local で完結 |
| 0008 (Rust → TS codegen) | FastAPI の OpenAPI 自動生成で完結 |
| 0009 (Strands → AgentCore agent) | サーバー側 LLM 推論不要、yuipath-mcp 廃止 |
| 0010 (MCP-first operation map) | Gateway が OpenAPI → MCP 自動変換、operation map 不要 |

旧 ADR は履歴として保存 (Status: Superseded by ADR-0013)。

## Revisit when

- AgentCore Gateway がリリース blocker 級の問題を起こす → Lambda + 自前 MCP server に退避
- 性能要件 (大規模 PJ で計算が重い) で Python が限界 → Lambda 関数単位で Rust 採用 (混在)
- 他クラウド (GCP / Azure) 移行要望 → Cognito / AgentCore 依存を見直し
- AI 機能を本体 UI に持たせたい要望が強くなる → ADR-0012 を見直し

## 関連
- ADR-0002 (Event Log on DynamoDB) — スキーマをそのまま採用
- ADR-0003 (AI via external MCP) — 本 ADR で BYOC として再確認
- ADR-0011 (Roles and permissions) — Python 表現に調整
- ADR-0012 (Domain entities) — Python 表現に調整
- mock/ — UX 仕様として保持
