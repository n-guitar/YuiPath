# YuiPath

> シンプルで開かれたプロジェクト管理ツール

YuiPath は MS Project / ProjectLibre の代替を目指す Apache 2.0 ライセンスの OSS プロジェクト管理ツールです。タスク・スケジュール・依存関係・進捗の管理に必要な核となる機能だけを提供し、複雑な追加機能は意図的に抑えています。

## ステータス

**Mock phase 完了 → 設計・実装 phase 着手中**（2026-05-09 時点）

このリポジトリの現在の構成：

| パス | 内容 |
|---|---|
| [`mock/`](mock/) | HTML / CSS / JSX で書かれた製品 UI モック。製品 UX 仕様として機能するスナップショット |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records（配布形態 / データ層 / AI 統合 / ライセンス） |
| [`CLAUDE.md`](CLAUDE.md) | リポジトリのアーキテクチャ・規約ガイド |

実装は別構成で開始予定（[ADR-0001](docs/adr/0001-deployment-patterns.md)）：

- **Pattern A** — Tauri 2.0 + React/TS + Rust→WASM PM コア（ローカル動作）
- **Pattern B** — AWS（CloudFront + Lambda + DynamoDB On-Demand）（クラウド動作）
- 両者で 95% 以上のコードを共有

## 設計思想

1. **シンプルに、本質だけ。** タスク・期間・進捗・依存関係。PM の核を扱い、機能の網羅性は追わない
2. **正直な数字だけ出す。** EVM / SPI / CPI などデータが揃わないと嘘になる指標は表示しない
3. **読める / 軽い UI。** Notion ライクな柔らかい配色、システムフォント、ノイズの少ない密度
4. **ローカルファースト。** 個人利用は Tauri デスクトップ（オフライン・データは手元）。チームは AWS で同期
5. **AI は外付け。** コア製品は AI 依存ゼロ。必要なら MCP 経由で外部 AI と連携（[ADR-0003](docs/adr/0003-ai-via-external-mcp.md)）

## モックを動かす

```bash
cd mock/project
python3 -m http.server 8731
# http://localhost:8731/YuiPath.html を開く
```

ビルド工程はありません。`babel-standalone` がブラウザで JSX を変換します。詳細な構造は [`mock/README.md`](mock/README.md) と [`CLAUDE.md`](CLAUDE.md) を参照。

## モックでカバー済みの機能

- **ダッシュボード** — 「要注意（今）」「リスクのある先（先行マイルストーン）」の自動検出
- **テーブル** — Excel ライク編集、インデント / アウトデント、行ドラッグ並び替え、CSV インポート / エクスポート
- **ガントチャート** — バードラッグで日付編集、フェーズ折り畳み、クリティカルパス強調、フィルタ、依存矢印
- **カレンダー** — 月ビュー、祝日・営業日表示
- **リソース** — 稼働率ヒートマップ、アサイン解除連動の削除
- **設定** — カレンダー / 言語 / About
- **認証フロー** — ログイン、サインアップ、パスワード再設定、ログアウト
- **ダークモード** — auto / light / dark（OS 設定追従）

詳細な機能棚卸しと既知の制限は [`CLAUDE.md`](CLAUDE.md) を参照。

## 関連ドキュメント

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | リポジトリ全体のアーキテクチャ・規約・サブシステム解説 |
| [`mock/README.md`](mock/README.md) | モックの構造、起動、実装メモ |
| [`mock/chats/issue.md`](mock/chats/issue.md) | 製品の初期構想・市場調査・技術検討（長文） |
| [`mock/chats/chat1.md`](mock/chats/chat1.md) | モック iteration の設計対話ログ |
| [`docs/adr/`](docs/adr/) | 設計判断の記録 |

## ライセンスと商標

- **ソースコード**: [Apache License 2.0](docs/adr/0004-license-apache-2-with-trademark.md)（`LICENSE` / `NOTICE` ファイル本体は実装 phase で配置予定）
- **ブランド**: "YuiPath" の名前およびロゴは n-guitar の商標として保護。利用ポリシーは [ADR-0004](docs/adr/0004-license-apache-2-with-trademark.md) 参照（`TRADEMARKS.md` 本体は実装 phase で配置予定）
- Copyright © 2026 n-guitar
