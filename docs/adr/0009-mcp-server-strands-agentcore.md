> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は「yuipath-mcp を Strands Agents で実装し、ローカル → AgentCore Runtime の両デプロイをサポート」としていた。ADR-0012 で「AI 機能は本体 UI に一切持たない (BYOC = Bring Your Own Claude)」と決定したため、サーバー側 LLM 推論サーバー (yuipath-mcp) は不要となり廃止。ADR-0013 で MCP は AgentCore Gateway が OpenAPI から自動変換する設計に。設計議論の履歴として保存。

# 0009: MCP server の実装手段 — Strands Agents (ローカル) → Bedrock AgentCore (リモート)

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context (厶史)

ADR-0003 の「AI 機能は外付け MCP」を実装手段として Strands Agents (Python) で設計していた。ローカル stdio/HTTP + AgentCore Runtime の両デプロイを同じエージェントコードで提供する計画だった。

ADR-0012 (2026-05-09) で「**AI 機能は YuiPath 本体に UI を一切持たない**」と決定したことで、サーバー側 LLM 推論を裂せた合成 MCP サーバー (yuipath-mcp) の存在意義が消えた。ユーザーは Claude Desktop 等の MCP client で推論させ、YuiPath はただデータ操作 MCP を出すだけで足りる。

ADR-0013 で MCP 出口も AgentCore Gateway の OpenAPI → MCP 自動変換に一元化されたため、Strands / yuipath-mcp / AgentCore Runtime のスタックを採らない。

## 関連
- ADR-0013 (現行のアーキテクチャ)
- ADR-0003 (AI external) — BYOC として再確認
- ADR-0012 (Domain entities) — 「AI UI 不在」の根拠
