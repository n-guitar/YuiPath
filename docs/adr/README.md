# Architecture Decision Records (ADR)

YuiPath プロジェクトの**設計上の重要な決定**を、決定した時点の文脈と共に記録する場所。

## 現在のアーキテクチャ要約

**ADR-0013** で全体アーキテクチャをリセットした。現在の設計は:

- **Web only** (Tauri デスクトップは采用しない)
- **Backend: Python FastAPI** (Lambda コンテナ / ローカル docker)
- **Storage: DynamoDB** (env で AWS / DynamoDB Local 切替)
- **Auth: Cognito (managed)** — API Gateway HTTP API + Cognito JWT Authorizer
- **MCP: AgentCore Gateway** — OpenAPI → MCP tools 自動変換
- **Frontend: React + Vite + TypeScript** (mock 移植)

詳細: [ADR-0013](./0013-architecture-reset.md)

## なぜ ADR を書くのか

- **将来の自分／contributors が「なぜこの形になっているのか」を辿れる**
- 決定を覆したくなった時、当時の前提がまだ有効か検証できる
- 暗黙の制約（コスト・ライセンス・運用）が文書化される

## フォーマット

各 ADR は以下のセクションを持つ:

```markdown
# NNNN: タイトル

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context
何の問題に答える必要があったか。当時の制約・選択肢。

## Decision
何を選んだか。

## Consequences
受け入れた帰結（良い面と悪い面の両方）。

## Risks (optional)
将来問題になりうる点と、その時の対処方針。

## Revisit when (optional)
この決定を見直すべきトリガー。
```

## ルール

- Accepted 状態の ADR は **immutable**。変更したい場合は新しい ADR を起こして「Supersedes #NNNN」と明記
- Proposed 状態の ADR は議論中のドラフトとして訂正可 (Updated: タイムスタンプを先頭に追記)
- Superseded 状態の ADR は履歴として保存、本文は変更しない (先頭に警告ブロックのみ追加)
- ファイル名: `NNNN-kebab-case-title.md`（番号は連番）
- Status は `Proposed` で書き始め、合意したら `Accepted` に
- 撤回した場合は `Deprecated` （理由を本文に）

## 現在の ADR 一覧

### 現行 (Active)

| # | タイトル | Status |
|---|---|---|
| [0002](./0002-event-log-on-dynamodb.md) | Event log を DynamoDB single-table に格納 | Accepted |
| [0003](./0003-ai-via-external-mcp.md) | AI 機能は外部 MCP クライアント経由 (BYOC) | Accepted |
| [0004](./0004-license-apache-2-with-trademark.md) | Apache License 2.0 + TRADEMARKS.md でブランド保護 | Accepted |
| [0011](./0011-roles-and-permissions.md) | ロールと権限分離 (system_admin / project_admin / project_member) | Proposed |
| [0012](./0012-domain-entities.md) | ドメインエンティティ確定 (mock 由来、7 entities) | Proposed |
| [0013](./0013-architecture-reset.md) | アーキテクチャリセット (Web only / Python FastAPI / AWS managed) | Proposed |

### 厶史 (Superseded)

以下は ADR-0013 により置き換えられた。設計議論の履歴として保存。

| # | タイトル | Superseded 理由 |
|---|---|---|
| [0001](./0001-deployment-patterns.md) | Deployment patterns (Tauri ローカル + AWS クラウド) | Pattern A (Tauri) を捨てた |
| [0005](./0005-monorepo-workspace-layout.md) | Monorepo workspace layout (Cargo + pnpm) | Cargo workspace 不要 |
| [0006](./0006-storage-and-event-trait-abstraction.md) | Storage と Event Log を trait で抽象化 | 1 backend なので trait 不要 |
| [0007](./0007-local-dev-environment.md) | ローカル開発環境（cargo-lambda + LocalStack） | Python + DynamoDB Local で完結 |
| [0008](./0008-types-and-schema-codegen.md) | 型・スキーマ・API 契約の Rust→TS codegen | FastAPI の OpenAPI 自動生成で完結 |
| [0009](./0009-mcp-server-strands-agentcore.md) | MCP server の実装手段 — Strands → AgentCore | yuipath-mcp 廃止、サーバー側 LLM 不要 |
| [0010](./0010-mcp-first-and-read-write-separation.md) | MCP を第一級 API 表面に / operation map | AgentCore Gateway が自動変換 |

## 参考

- Michael Nygard, "Documenting Architecture Decisions" (2011)
- https://adr.github.io/
