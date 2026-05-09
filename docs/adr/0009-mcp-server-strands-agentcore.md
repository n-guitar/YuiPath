# 0009: MCP server の実装手段 — Strands Agents (ローカル) → Bedrock AgentCore (リモート)

- Status: Proposed
- Date: 2026-05-09
- Refines: ADR-0003 (AI 機能は MCP server + REST API として外付け)

## Context

ADR-0003 で「AI 機能は本体プロダクトに含めず、別リポジトリ `yuipath-mcp` として独立提供する」と決めた。本 ADR はその **実装手段** を決める。

要件:

- ローカルで動く、セルフホスト可能 （Pattern A ユーザーと部分重なる「オフライン・プライバシー重視」の層）
- リモートで有償 SaaS として提供可能 （商用ルートを残す、ADR-0003 Consequences 参照）
- **同一のツールコードがローカル / リモートの両方で動く**（保守コスト最小化）
- LLM は交換可能に保つ (Claude / Bedrock / OpenAI / Ollama)
- ツール I/O 規約（project JSON 入力 → JSON Patch 出力）は ADR-0003 に従う

比較した選択肢（エージェント SDK）:

| SDK / フレームワーク | MCP サーバー動作 | LLM 交換性 | ローカル ↔ AWS 一貫性 | 評価 |
|---|---|---|---|---|
| **Strands Agents (AWS OSS)** | ✅ 標準対応 | ✅ Bedrock / Anthropic / OpenAI / Ollama | ✅ 同一コードが AgentCore へ | **✅ 採用** |
| LangChain / LangGraph | △ 別 mcp adapter | ✅ | △ 実行環境ごとに調整 | △ |
| LlamaIndex | △ | ✅ | △ | △ |
| Anthropic SDK 直 + 手書き MCP | ✅ | ✗ Claude 固定 | △ | ✗ LLM ロックイン |
| AWS Lambda で MCP サーバーを手書き | △ | 何でも | △ ローカルとコード差 | ✗ 差が出る |

比較した選択肢（リモートホスティング）:

| ホスティング | 認証 | スケール | 計測 | MCP ビルトイン | 評価 |
|---|---|---|---|---|---|
| **Bedrock AgentCore Runtime + Gateway** | ✅ IAM / OAuth | ✅ スケール to zero | ✅ CloudWatch 統合 | ✅ Gateway が MCP 話す | **✅ 採用** |
| Lambda + API Gateway で手書き | ✅ | ✅ | △ セッション管理手書き | △ 手動 | △ |
| ECS / Fargate | △ | △ 常時起動 | △ | 手書き | ✗ コスト高 |
| EC2 | △ | ✗ | △ | 手書き | ✗ |
| 他クラウド（Cloudflare / Fly.io 等） | - | ✅ | △ | 手書き | △ AWS 一貫性崩れ |

Strands Agents は Bedrock AgentCore にファーストクラスでデプロイでき、同じエージェントコードがローカルでも AgentCore Runtime でも動く。**今回の「ローカルファースト + リモートも同じコード」要件に完全一致する**。

## Decision

**別リポジトリ `yuipath-mcp` を Strands Agents (Python) で実装し、ローカル stdio/HTTP と Bedrock AgentCore の両デプロイ先をサポートする。**

### リポジトリ構成（`n-guitar/yuipath-mcp`）

```
yuipath-mcp/
├── src/
│   └── yuipath_mcp/
│       ├── tools/                 # 純粋ツール関数 (LLM に依存せずテスト可能)
│       │   ├── generate_wbs.py    #   project description → task tree (JSON Patch)
│       │   ├── estimate_duration.py
│       │   ├── suggest_dependencies.py
│       │   ├── analyze_critical.py
│       │   └── optimize_resources.py
│       ├── schemas/                # JSON Schema (yuipath 本体の shared-types から取り込み)
│       ├── agent.py                # Strands Agent 定義（ツールを @tool で登録）
│       ├── server_local.py         # MCP server (stdio / HTTP) エントリー
│       └── server_agentcore.py     # AgentCore Runtime エントリー
├── deploy/
│   ├── agentcore.yaml          # AgentCore Toolkit 設定
│   └── cdk/                    # Gateway と IAM を CDK で補完
├── tests/
├── pyproject.toml
└── README.md
```

### Phase 進め方

| Phase | 成果物 | 認証 | LLM |
|---|---|---|---|
| 5a (この ADR と同期) | ツール関数スケルトン + Strands Agent 雛形 | なし (ローカル stdio) | ユーザー設定 |
| 5b | `server_local.py` を stdio + HTTP 両対応 | API key (env) | ユーザー設定 |
| 5c (将来) | AgentCore Runtime デプロイ + Gateway で MCP 公開 | IAM / Cognito | Bedrock |
| 5d (将来) | 有償 SaaS テナント化 | 同上 + billing | Bedrock |

### ローカルモード

```bash
# スタンドアロン (Claude Desktop / Claude Code / Cursor 等へ接続)
uvx yuipath-mcp serve --stdio

# HTTP モード (本体 SPA の Settings 畫面から接続)
uvx yuipath-mcp serve --http --port 3030
```

- LLM 設定はユーザー責任（`ANTHROPIC_API_KEY` / `BEDROCK_PROFILE` / `OLLAMA_BASE_URL` 等を env で）
- **ツールだけモード**（LLM を使わず MCP クライアント側の LLM がツールを叩く）と、**エージェントモード**（yuipath-mcp 内部で Strands Agent が推論）の 2 つを提供
- Pattern A (Tauri) は sidecar として yuipath-mcp を同梱するオプションも将来検討（オフラインユーザー向けに Ollama バンドル）

### リモートモード（Bedrock AgentCore）

```
クライアント (Claude Code / yuipath SPA / 3rd party)
     │  MCP over HTTP+OAuth
     ▼
┌──────────────────────────────┐
│ AgentCore Gateway              │  ← IAM / Cognito 認証、スロットリング、MCP 化
└─────────┬──────────────────┘
          ▼
┌──────────────────────────────┐
│ AgentCore Runtime              │  ← server_agentcore.py (同じ Strands Agent)
│ (Strands Agent ロード)         │
└─────────┬──────────────────┘
          ▼
     Bedrock (Claude / Nova) + tools/
```

- AgentCore Toolkit (`bedrock-agentcore` CLI) で `agentcore deploy` 一発
- Gateway で OAuth / Cognito 互換認証を MCP サーバーに付与
- LLM は Bedrock（ユーザー選択不要、課金は SaaS 提供側）

### コード共有の不変条件

- `tools/` 以下は **純関数 + JSON 入出力**のみ、エージェントや LLM に一切依存しない
- `agent.py` は Strands `@tool` で `tools/` を wrap するだけ
- `server_local.py` と `server_agentcore.py` は **起動 entry point の違いだけ**、エージェント本体は共通
- LLM バックエンドは Strands の provider abstraction で入れ替え (`Anthropic` / `Bedrock` / `OpenAI` / `Ollama`)

### 本体 (yuipath) との契約

- yuipath-mcp は yuipath 本体の `packages/shared-types` から JSON Schema を git submodule or `pip install` で取り込む
- 型スキーマを source of truth にして prompt テンプレを生成 (drift 防止)
- yuipath 本体は **MCP server を一切 import しない** (ADR-0003 の 「AI ランタイム依存ゼロ」を維持)
- yuipath 本体の Settings タブで MCP エンドポイント URL + 認証情報を入れるのみ

## Consequences

### Accepted (positive)
- ローカル (プライバシー重視、個人ユーザー、OSS contributor) とリモート SaaS (マネージド、有償) の両ルートを同じコードで提供
- AWS 公式スタック（Strands + AgentCore + Bedrock）を採ったことで、認証・スケール・計測・MCP 化のボイラープレートが揃う
- LLM provider の交換性が Strands で保たれる（ローカル: Ollama / Anthropic / OpenAI、リモート: Bedrock）
- ADR-0003 の「本体は AI ランタイム依存ゼロ」が個リポジトリ分離 + クライアント設定のみによって保たれる
- AgentCore の Memory / Code Interpreter サービスを将来追加コスト低めで採用できる

### Accepted (negative)
- AWS 色が強い（Strands はマルチクラウドだが AWS 発 OSS、AgentCore は AWS 独自）。他クラウドへのポータビリティは判断上不利
- リモート側は Bedrock リージョン依存 (本稿作成時点では Tokyo 含む主要リージョンに展開済)
- Python スタックが柔らかく入る (本体は Rust + TypeScript、MCP は Python)。CI ・ツールチェーンが多言語化する
- AgentCore は 2025 年 GA の新しいサービス、仕様の成熟途中

## Risks

### AgentCore の仕様変更
- 2025 GA のサービス。Toolkit / Gateway / Runtime の API が年単位で変わる可能性
- **緩和**: `server_agentcore.py` のアダプタ層を薄く保ち、Strands Agent 本体は AgentCore 依存を最小化。最悪の場合 Lambda 手書きに退避可能にしておく

### Strands Agents のエコシステム成熟度
- 2025 発表の OSS。Anthropic SDK や LangChain ほど community が広くはない
- **緩和**: `tools/` は純関数に保つので、Strands が使えなくなっても他 SDK に乗り換えとして低コスト

### Pattern A ユーザーのコスト負担
- オフラインで使うためにはローカル LLM (Ollama 等) が必須。セットアップコスト高
- **対処**: 本体は AI 抹きで完全動作し、MCP はオプトインとして明示 (ADR-0003 の推進)

### 本体と yuipath-mcp のスキーマ drift
- 本体の `pm-core` 型を変更した際、yuipath-mcp 側のツールスキーマが古いままになる
- **緩和**: yuipath-mcp の CI で yuipath 本体 main の schema (npm package or git tag) を fetch し、drift を fail に

## Revisit when

- AgentCore がリトライア不可の破壊的変更・サービス停止を起こした
- Strands Agents がメンテされなくなった / 他 SDK に主流が移った
- リモート SaaS 提供を起動せず「オンプレ企業顧客に MCP をセルフホストさせたい」要望が主になった （→ AgentCore 依存を見直し、Lambda + Cognito に退避も検討）
- LLM 以外のツール実装（点規則ベースの推論、古典プランナーアルゴリズム）が LLM より質・コストで勝るようになった

## 関連
- ADR-0003 (AI via external MCP) — 本 ADR はその実装手段の詳細化
- ADR-0008 (型・スキーマ生成) — yuipath-mcp も同じ schema を参照
- AWS Strands Agents docs / Bedrock AgentCore docs (本 ADR 採用時点の仕様に依拠)
