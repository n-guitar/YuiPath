> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は cargo-lambda + Rust Lambda 前提だったため、ADR-0013 (Python FastAPI + DynamoDB Local) で置き換えられた。設計議論の履歴として保存。

# 0007: ローカル開発環境（cargo-lambda + LocalStack）

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context (厶史)

Pattern B (Rust Lambda) を AWS アカウントなしで開発可能にするため、3 ティア構成 (Tier 1: cargo run + SQLite, Tier 2: cargo lambda watch + LocalStack, Tier 3: Lambda RIE Docker) を設計していた。

ADR-0013 で backend を Python FastAPI にしたため、ローカル開発は `docker-compose up` で FastAPI (uvicorn) + DynamoDB Local + Vite dev server を起動するシンプル構成に変更。レイヤを分ける代わりに「ローカルと AWS で endpoint URL のみ差る」設計。

## 関連
- ADR-0013 (現行のアーキテクチャ)
