> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は「Pattern A (SQLite) + Pattern B (DynamoDB) 両建て」前提だったため、ADR-0013 で DynamoDB 一本化し trait 抽象不要となった。設計議論の履歴として保存。

# 0006: Storage と Event Log を trait で抽象化

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context (厶史)

ADR-0001 で Pattern A (SQLite) と Pattern B (DynamoDB) を並行サポートするため、`ProjectStore` / `EventLog` / `Authenticator` の 3 trait を Rust で定義し、複数実装を差し込める設計を採用していた。

ADR-0013 で backend を DynamoDB 一本、言語を Python にリセットしたため、trait 抽象は不要。 endpoint URL を env で切替えるだけで AWS / DynamoDB Local 両対応し、認証は AWS マネージド（Cognito JWT Authorizer）に委譲。

## 関連
- ADR-0013 (現行のアーキテクチャ)
- ADR-0002 (Event Log on DynamoDB) — スキーマ設計はそのまま有効
- ADR-0011 (Roles) — ownership チェックのロジックは handler 層で実装
