# YuiPath

> シンプルで開かれたプロジェクト管理ツール

YuiPath は MS Project / ProjectLibre の代替を目指す Apache 2.0 ライセンスの OSS プロジェクト管理ツールです。タスク・スケジュール・依存関係・進捗の管理に必要な核となる機能だけを提供し、複雑な追加機能は意図的に抑えています。

## アーキテクチャ要約 ([ADR-0013](docs/adr/0013-architecture-reset.md))

- **Web only** — Tauri デスクトップは採用しない (`docker-compose up` でローカル開発、AWS で本番)
- **Backend: Python FastAPI** (Lambda + ローカル uvicorn を env で切替)
- **Storage: DynamoDB** (DynamoDB Local / AWS の endpoint 切替)
- **Auth: AWS マネージド** — Browser は Cognito JWT Authorizer / MCP は AgentCore Gateway
- **OpenAPI が source of truth** — FastAPI 自動生成、TS client / MCP tools 自動派生
- **AI は外付け** — 本体に AI UI は持たない、Claude Desktop 等の MCP client から AgentCore Gateway 経由でアクセス

## クイックスタート

```bash
git clone https://github.com/n-guitar/yuipath.git
cd yuipath
git config core.hooksPath .githooks
docker-compose up
# → http://localhost:5173 (web), http://localhost:8000 (api)
```

詳細は [docs/dev-guide.md](docs/dev-guide.md) 参照。

## リポジトリ構成

```
yuipath/
├── apps/
│   ├── web/                # React + Vite SPA (Phase 2 で mock 移植)
│   └── api/                # Python FastAPI app (Phase 1)
├── packages/
│   └── api-client/         # openapi-typescript で自動生成 (Phase 1 完了後)
├── infra/
│   └── cdk/                # AWS CDK (Phase 3)
├── docker-compose.yml
├── docs/
│   ├── adr/                # Architecture Decision Records
│   └── dev-guide.md
└── mock/                   # UX spec として保持 (実装中も削除しない)
```

## 設計思想

1. **シンプルに、本質だけ。** タスク・期間・進捗・依存関係。PM の核を扱い、機能の網羅性は追わない
2. **正直な数字だけ出す。** EVM / SPI / CPI などデータが揃わないと嘘になる指標は表示しない
3. **読める / 軽い UI。** Notion ライクな柔らかい配色、システムフォント、ノイズの少ない密度
4. **マネージドに乗る。** 自前で JWT 検証 / MCP サーバーを書かない、AWS に委譲して書く量を減らす
5. **AI は外付け。** コア製品に AI UI なし。MCP 経由で外部 LLM クライアント (BYOC = Bring Your Own Claude)

## モックを動かす

```bash
cd mock/project
python3 -m http.server 8731
# http://localhost:8731/YuiPath.html
```

`mock/` は **UX spec として凍結**。実装中も削除・改変しない。

## ステータス

- ✅ Mock phase 完了 (`mock/`)
- ✅ ADR / 設計確定 (ADR-0013、Phase 0–4 issue 起票済み)
- 🔄 Phase 0–4 実装中 (Issue #10〜#15)

## 関連ドキュメント

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | リポジトリ全体のアーキテクチャ・規約・サブシステム解説 |
| [`docs/adr/`](docs/adr/) | 設計判断の記録 (ADR-0013 が現行アーキテクチャ) |
| [`docs/dev-guide.md`](docs/dev-guide.md) | 開発環境セットアップとコマンドリファレンス |
| [`mock/README.md`](mock/README.md) | モックの構造、起動、実装メモ (UX spec) |

## ライセンスと商標

- **ソースコード**: [Apache License 2.0](LICENSE)
- **ブランド**: "YuiPath" の名前およびロゴは商標として保護。利用ポリシーは [TRADEMARKS.md](TRADEMARKS.md) 参照
- Copyright © 2026 YuiPath contributors
