> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は「operation map から 4 表面 (REST / MCP / Tauri / CLI) を生成」という自前アダプタシステムを設計していた。ADR-0013 で AgentCore Gateway が OpenAPI → MCP を自動変換するため、operation map レイヤ・pm-mcp crate ・codegen 拡張は不要となった。設計議論の履歴として保存。
>
> ただし本 ADR の「参照 (read) と更新 (write) を名前空間と token scope で分ける」思想は ADR-0011 に引き継がれている。「redable scope = read / write / admin / system」は Cognito custom scope として実装可能。

# 0010: MCP を第一級 API 表面にする / 参照・更新の分離

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context (厶史)

ユーザー要件「すべての操作を MCP で上り下りできる、参照・更新を明確に分ける」を受けて、`pm-api` crate に operation map を置き、REST / MCP / Tauri / CLI の 4 表面を同じソースから生成する設計を採用していた。

ADR-0013 で backend を FastAPI にし、MCP 出口を AgentCore Gateway に委譲したため:

- FastAPI の REST endpoint が唯一の手書き表面
- OpenAPI (FastAPI 自動生成) が source of truth
- MCP への変換は Gateway が担当、我々は operation map を書かない
- Tauri / CLI は ADR-0013 で scope 外

したがって operation map レイヤ、`pm-mcp` crate、Storage trait の Reader/Writer 分割、codegen 拡張は不要となった。

## 厶史として引き継がれたアイデア

- **参照 = trust / 更新 = 都度聶く UX**: そのまま MCP クライアント (Claude Desktop) の標準振舞いで達成
- **token scope の 4 区分 (read / write / admin / system)**: ADR-0011 でロール設計に引き継がれ、必要になったら Cognito custom scope で実装
- **`q.*` / `c.*` / `s.*` のツール名規則**: AgentCore Gateway が OpenAPI から生成する MCP tool 名とは必ずしも一致しないため、スコープ外

## 関連
- ADR-0013 (現行のアーキテクチャ)
- ADR-0011 (Roles) — token scope の設計思想はそちらで実装設計可能
- ADR-0003 (AI external) — 本 ADR で MCP を AI 限定から拡張した思想は ADR-0013 でも有効 (AgentCore Gateway が全操作を MCP 化)
