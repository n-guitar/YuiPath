> [!WARNING]
> **SUPERSEDED by [ADR-0013](./0013-architecture-reset.md)** (2026-05-09)
>
> 本 ADR は Cargo + pnpm monorepo 前提だったため、ADR-0013 によるアーキテクチャリセット (Python FastAPI ベース) で置き換えられた。設計議論の履歴として保存。

# 0005: Monorepo workspace layout (Cargo + pnpm)

- Status: Superseded by ADR-0013
- Date: 2026-05-09

## Context

ADR-0001 で「Pattern A (Tauri ローカル) + Pattern B (AWS) を並行サポート、95% のコードを共有」を決定した。実装 phase に入るにあたり、**どこに何を置くか / どうビルドするか** を決める必要がある。

詳細は本 ADR の元ファイルに記載 (Cargo workspace + pnpm workspace の並存、crate 依存方向の不変条件等)。ADR-0013 で Web only / Python FastAPI にリセットされ、本 ADR の詳細は不要となった。

## Decision (厶史)

単一リポジトリに Cargo workspace と pnpm workspace を共存させる構成を採用していた。現在は ADR-0013 で pnpm + uv に簡素化されている。

元の詳細 (Cargo crate 一覧、依存グラフ、Tauri 統合設計、CI 設計など) は git 履歴で参照可能。

## 関連
- ADR-0013 (現行のアーキテクチャ)
