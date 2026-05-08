# 0003: AI 機能は MCP server + REST API として外付け

- Status: Accepted
- Date: 2026-05-08

## Context

YuiPath は ProjectLibre Cloud の AI 機能（自然言語からの WBS 生成、期間推定、依存関係提案など）と同等以上を目指したい。一方で:

- 本体プロダクトを **OSS で配布したい** (ADR-0004)
- LLM API key を本体にバンドルすると、誰のキーで誰が支払うのか問題が発生
- 個人の LLM 選好（Claude / GPT / Gemini / Bedrock / ローカル Ollama）を強制したくない
- AI 抜きでも **完全に機能する PM ツール** であるべき
- AI 連携を将来的に追加・置換できる構造にしたい

検討した選択肢:

| 案 | OSS 配布 | LLM 選択自由度 | エージェント連携 | 評価 |
|---|---|---|---|---|
| 本体に LLM SDK 同梱 | △ | ✗ (固定) | ✗ | API key 管理問題 |
| 本体内に AI 抽象化レイヤ | ○ | ○ | △ | 設計が肥大化 |
| **MCP server + REST API として完全外付け** | **◎** | **◎** | **◎** | **採用** |

MCP (Model Context Protocol) は Anthropic が策定した標準プロトコルで、Claude Code をはじめとする LLM クライアントから直接ツールを叩ける。REST API として並行公開することで、MCP 非対応クライアント（自社アプリ等）からも使える。

## Decision

**AI 機能は本体プロダクトに含めず、別リポジトリの `yuipath-mcp` として独立提供する。**

### 構成

```
yuipath-mcp-server/                  ← 別リポジトリ
├── src/
│   ├── index.ts                     ← MCP server (Anthropic SDK)
│   ├── rest.ts                      ← Express REST API
│   └── tools/
│       ├── generate_wbs.ts          ← 自然言語 → WBS
│       ├── estimate_duration.ts     ← 期間推定
│       ├── suggest_dependencies.ts  ← 依存関係提案
│       ├── analyze_critical.ts      ← クリティカルパス解析
│       └── optimize_resources.ts    ← リソース平準化提案
└── package.json
```

各ツールの I/O 規約:
- **入力**: 現在のプロジェクト JSON（または自然言語プロンプト + 既存タスク）
- **出力**: JSON Patch 形式の差分提案
- **適用**: ユーザーが UI で承認してから本体に書き込む（AI が直接書き換えない）

### 本体側

- AI 機能の **ランタイム依存ゼロ**（`pm-core` も React 側も MCP/AI を import しない）
- 「AI Settings」UI のみ持つ（エンドポイントURL + 認証情報の設定）
- AI OFF 時は完全に独立して動作

### LLM バックエンド

ユーザーが選ぶ:
- Anthropic Claude API
- AWS Bedrock (IAM 認証)
- OpenAI GPT
- Google Gemini
- ローカル Ollama (プライバシー優先用途)

## Consequences

### Accepted (positive)
- 本体は AI 抜きで OSS 配布可能（Apache 2.0 + LLM ベンダーロックイン無し）
- LLM の進化に合わせて MCP server だけ更新できる
- Claude Code 等の LLM クライアントから直接プロジェクトを操作可能（差別化要素）
- AI 機能を商用提供（Bedrock AgentCore Gateway 経由など）するルートも残せる
- AI 提案が常に「ユーザー承認 → 適用」の流れになり、誤変更のリスクを構造的に防げる

### Accepted (negative)
- ユーザーが MCP server を別途デプロイ／設定する手間
- 本体と MCP server のスキーマ/プロトコルバージョン整合性を維持する必要
- 「ワンクリックで AI が使える」体験は提供しにくい（Cloud 版で fix する余地）

## Risks

### MCP プロトコルの破壊的変更
- MCP は新興プロトコル、仕様改訂が起きうる
- **緩和**: バージョン pin、REST API も並行で残す（フォールバック経路）

### ユーザー混乱
- 「AI が動かない」報告の原因が AI 設定／LLM API key／MCP server 接続のどこか不明
- **緩和**: 本体側に「AI 接続テスト」ボタンを置く、ログを明示

### 商用化との整合
- 将来 SaaS 版で AI を売りたい場合、AI を含めたパッケージとして提供する必要が出る
- 本決定はあくまで OSS 本体の話。SaaS 版は MCP server を裏で動かす構成で OK

## Revisit when

- MCP プロトコルが大きく覆された／普及しなかった場合
- ユーザーから「AI セットアップが煩雑すぎる」フィードバックが多数
- AWS Bedrock AgentCore 等のマネージドサービスが MCP を完全標準化し、自前 server が不要になった

## 関連
- ADR-0001: Pattern A/B の前提（AI は両方で外付け）
- AgentCore Gateway 調査（issue #129）
