# Architecture Decision Records (ADR)

YuiPath プロジェクトの**設計上の重要な決定**を、決定した時点の文脈と共に記録する場所。

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

- ADR は **immutable**。変更したい場合は新しい ADR を起こして「Supersedes #NNNN」と明記
- ファイル名: `NNNN-kebab-case-title.md`（番号は連番）
- Status は `Proposed` で書き始め、合意したら `Accepted` に
- 撤回した場合は `Deprecated` （理由を本文に）

## 現在の ADR 一覧

| # | タイトル | Status |
|---|---|---|
| [0001](./0001-deployment-patterns.md) | Deployment patterns (Tauri ローカル + AWS クラウド) | Accepted |
| [0002](./0002-event-log-on-dynamodb.md) | Event log を DynamoDB single-table に格納 | Accepted |
| [0003](./0003-ai-via-external-mcp.md) | AI 機能は MCP server + REST API として外付け | Accepted |
| [0004](./0004-license-apache-2-with-trademark.md) | Apache License 2.0 + TRADEMARKS.md でブランド保護 | Accepted |
| [0005](./0005-monorepo-workspace-layout.md) | Monorepo workspace layout (Cargo + pnpm) | Proposed |
| [0006](./0006-storage-and-event-trait-abstraction.md) | Storage と Event Log を trait で抽象化 | Proposed |
| [0007](./0007-local-dev-environment.md) | ローカル開発環境（cargo-lambda + LocalStack） | Proposed |
| [0008](./0008-types-and-schema-codegen.md) | 型・スキーマ・API 契約は Rust → TS への一方向 codegen で統一 | Proposed |
| [0009](./0009-mcp-server-strands-agentcore.md) | MCP server の実装手段 — Strands Agents (ローカル) → Bedrock AgentCore (リモート) | Proposed |

## 参考

- Michael Nygard, "Documenting Architecture Decisions" (2011)
- https://adr.github.io/
