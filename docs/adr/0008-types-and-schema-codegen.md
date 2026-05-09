> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は Rust serde を source of truth とした codegen pipeline を設計していたが、ADR-0013 で backend が FastAPI (Python) になり、OpenAPI を FastAPI が自動生成、openapi-typescript で TS 型を生成するシンプル構成に変更された。設計議論の履歴として保存。

# 0008: 型・スキーマ・API 契約は Rust → TS への一方向 codegen で統一

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context (厶史)

`pm-core` (Rust) の serde struct を唯一の source of truth とし、ts-rs / schemars / utoipa の 3 ツールで TS / JSON Schema / OpenAPI を生成する設計。

ADR-0013 で backend を Python (FastAPI + pydantic) にしたことで、以下のほうがシンプル:

- FastAPI が OpenAPI を自動生成 (pydantic モデルから)
- openapi-typescript で TS 型と client を生成
- AgentCore Gateway が OpenAPI を読んで MCP tools を自動変換

3 ツール連携 + 4 つ目の出力 (mcp-tools.json) を自前で組む必要が消えた。

## 関連
- ADR-0013 (現行のアーキテクチャ)
