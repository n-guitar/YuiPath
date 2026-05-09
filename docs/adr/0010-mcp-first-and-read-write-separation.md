# 0010: MCP を第一級 API 表面にする / 参照・更新の分離

- Status: Proposed
- Date: 2026-05-09
- Refines: ADR-0003 (AI 機能は MCP server として外付け), ADR-0005, ADR-0006, ADR-0008, ADR-0009

## Context

ユーザー要件（設計セッション 2026-05-09）:

> **「最初からすべての操作を MCP で操作できる前提で考えてほしい。参照と更新系は明確に分ける。MCP これがこのプロダクトの一番の肝」**

これは ADR-0003 の「AI オプションとしての MCP」とは位置付けが違う:

- ADR-0003 は **「AI だけ MCP 経由」** と読める余地があった
- 本 ADR で **「すべての操作を MCP でも叩ける」** を明記する
- LLM / Claude Code / 3rd party スクリプト / 本体 SPA が同じツールセットを踏める
- これにより「AI は特別」というポジショニングが消える

参照・更新の分離要件の背景:

- MCP クライアント (Claude Desktop / Claude Code / Cursor) には **ツールごとの承認ポリシー** がある
- ユーザーストーリ: 「**参照は trust して自動許可、更新は都度聶く**」が背骨の UX
- サーバー側も権限スコープを read/write で分離し、誤った token で更新が走らないようにする

## Decision

**すべての操作は Phase 1 以降、MCP ツールとしても表出される。参照 (read) と更新 (write) をツール名・token スコープ・MCP annotation の 3 層で分離する。**

### 不変条件

1. **どの操作も 4 つの入り口から叩ける**: MCP / REST / Tauri commands / CLI
2. **同じコードパス (handler) が走る**: 入り口ごとのロジック重複ゼロ
3. **名前空間で read/write を機械的に分ける**: 人間も LLM も見た目で判別できる
4. **read ツールは副作用ゼロ**: 何回叩いても同じ、Event Log も書かない

### 実装方針—「operation map」を 1 つだけ持つ

`pm-api` crate で **操作一覧を単一のソース** として記述し、各アダプタがそれを出し分ける:

```rust
// crates/pm-api/src/ops.rs
// 読み取り (Query)
pub async fn list_tasks    (ctx, in: ListTasksIn)    -> Result<Vec<Task>>;
pub async fn get_project   (ctx, in: GetProjectIn)   -> Result<Project>;
pub async fn list_events   (ctx, in: ListEventsIn)   -> Result<Vec<Event>>;
// 更新 (Command)
pub async fn create_task   (ctx, in: CreateTaskIn)   -> Result<Task>;
pub async fn update_status (ctx, in: UpdateStatusIn) -> Result<Task>;
pub async fn delete_project(ctx, in: DeleteProjectIn)-> Result<()>;

// 一覧 (ここが source of truth)
pub const QUERIES: &[QueryEntry] = &[
    query!("tasks.list",     list_tasks),
    query!("projects.get",   get_project),
    query!("events.list",    list_events),
];
pub const COMMANDS: &[CommandEntry] = &[
    command!("tasks.create",  create_task),
    command!("tasks.update_status", update_status),
    command!("projects.delete",     delete_project),
];
```

`QueryEntry` / `CommandEntry` は名前、入出力型、関数ポインタ、metadata を包む軽い構造体。

### アダプタが各々適切に射影する

| Adapter | Query の出し方 | Command の出し方 |
|---|---|---|
| **MCP server (`pm-mcp`)** | `q.tasks.list` のように `q.` prefix 、MCP `readOnlyHint: true` annotation | `c.tasks.update_status`, `destructiveHint: true` (delete系), `idempotentHint` 適切に |
| **REST/HTTP** | `GET /q/tasks` (実体は `?filter=...` を `Input` に deserialize) | `POST /c/tasks/create` |
| **Tauri commands** | `q_tasks_list(input)` invoke | `c_tasks_update_status(input)` invoke |
| **CLI** | `yuipath q tasks list ...` | `yuipath c tasks update-status ...` |

名前空間を `q.*` / `c.*` で揃える意意:

- LLM プロンプトに「まず `q.*` で調べて、確信したら `c.*` を叫ぶ」と書ける
- ツールリストを見た人間も危険度が一目でわかる
- 認証 token の scope と評価しやすい

### Read = trust / Write = 都度承認 のポリシーを 3 層で付与

#### 層 1—MCP tool annotation（クライアント UX）

```jsonc
{
  "name": "q.tasks.list",
  "annotations": {
    "readOnlyHint": true,        // Claude Desktop で「今回だけ許可」は不要
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
{
  "name": "c.tasks.update_status",
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": false,    // 状態変えるがデータ消さない
    "idempotentHint": true       // expected_version 一致なら同じ結果
  }
}
{
  "name": "c.projects.delete",
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,     // クライアントに強い警告を出させる
    "idempotentHint": false
  }
}
```

Claude Desktop / Claude Code はこれを見て:
- `readOnlyHint: true` → 許可設定で auto-allow 可能
- `destructiveHint: true` → 実行前に不可逆であることを明示

#### 層 2—認証トークンの scope（サーバー強制）

```
scope: "yuipath:read"   → q.* のみ叩ける
scope: "yuipath:write"  → q.* + c.* の両方叩ける
scope: "yuipath:admin"  → 上記 + ユーザー・プロジェクト削除
```

- 誤った token でも c.* ツールを叩けない → サーバー側ゲート
- 読みたいだけの bot / dashboard / read-only LLM クライアントに `read` token だけ渡すと事故防止
- Pattern A (Tauri) でも `LocalDeviceAuth` が同じスコープを返す（同一人でも read-only セッションを張れる）

#### 層 3—Storage trait の分割（コンパイル時強制）

ADR-0006 の `ProjectStore` を ADR-0010 で以下に改訂:

```rust
#[async_trait]
pub trait ProjectReader: Send + Sync + 'static {
    async fn list_projects(...) -> Result<Vec<Project>>;
    async fn list_tasks(...) -> Result<Vec<Task>>;
    // 読み取りメソッドのみ
}

#[async_trait]
pub trait ProjectWriter: Send + Sync + 'static {
    async fn put_project(...) -> Result<u64>;
    async fn delete_project(...) -> Result<()>;
    // 更新メソッドのみ
}
```

Query handler は `Arc<dyn ProjectReader>` しか見えない → **誤って write を呼ぶコードがコンパイルに通らない**。

### Event Log は Command の境界で自動〇

- Query では Event Log を書かない
- Command は実行成功後、operation map の metadata（名前 / actor / before-after diff）を EventLog::append で一括記録
- handler に手書きを入れる必要なし—adapter / wrapper が処理

### Codegen の 4 つ目の出力（ADR-0008 拡張）

`pm-codegen` に MCP Tool Manifest を追加:

```
Rust serde struct + ops.rs
  ├── ts-rs            → packages/shared-types/src/*.ts
  ├── schemars         → packages/shared-types/schemas/*.json
  ├── utoipa           → packages/shared-types/openapi.json
  └── mcp-manifest     → packages/shared-types/mcp-tools.json   ← NEW
```

`mcp-tools.json` はツール名 / inputSchema / annotations の一覧。`pm-mcp` (Rust) も `yuipath-mcp` (Python, ADR-0009) もこれを読んでツールを出す → 両者のツール一覧がズレない。

### MCP サーバーは 2 レイヤ

| レイヤ | 住む場所 | 役割 |
|---|---|---|
| `pm-mcp` (Rust crate, 本リポジトリ) | 本体 binary に同梱 | operation map を MCP ツールとしてそのまま出す。Tauri でも Lambda でも起動させられる |
| `yuipath-mcp` (Python, 別リポ, ADR-0009) | 外部 | 上記をクライアントとして叩き、LLM 推論を乗せた Strands Agent を提供。`generate_wbs` のような AI 複合ツールはこちら |

つまり:

- **データ操作**は `pm-mcp` が直接提供（LLM 不要、中間位置なし）
- **推論・提案**は `yuipath-mcp` が `pm-mcp` を叩いて実現

## Consequences

### Accepted (positive)
- LLM / Claude Code / 3rd party / 本体 SPA が同じツールセットを踏める → 「ここだけ LLM でできてそこはできない」が構造的にありえない
- Read = trust / Write = 聶く UX が MCP クライアントの標準ークに乗り、手書き設定不要
- read-only LLM bot / dashboard / スクリプトに `read` scope token を渡して事故防止
- LLM プロンプト「`q.*` で調べ → `c.*` で実行」が主語になり、agent 設計がシンプルに
- Pattern A (Tauri) も sidecar で `pm-mcp` を起動して stdio ソケットを Claude Desktop に接続 → オフラインでも LLM 連携可
- Phase 進め方として、operation を書くと同時に 4 表面が出そろう—重複作業ゼロ

### Accepted (negative)
- operation map という軽い抽象層が 1 個増える（ただ axum::Router を手書きする他選肢と比べて 4 重記述ゼロの見返りは十分）
- Storage trait を Reader / Writer に分けるので ADR-0006 のドラフトコード例を以降書き換える必要
- MCP ツール名規則 (`q.*` / `c.*`) を差し替えると LLM クライアントの会話履歴互換性が壊れる → 入り口で freeze し、変更したい場合は新名を并行提供して deprecation を圧入
- `destructiveHint` 等の annotation 設定ミスが UX 事故に直結 → PR チェックリストに入れる

## Risks

### 「すべての操作」の範囲
- 設定 / 認証 / ビルシステム コールも MCP で叩けるべきか？—本 ADR では **ドメイン操作（プロジェクト・タスク・リソース・コメント・イベント・カレンダー）に限定**。認証トークン発行は MCP クライアント設定で達成されるべき、それ自身を MCP ツール化はしない
- ビリング・課金も対象外

### スケール・レート
- LLM が `c.*` を連打すると EventLog / DynamoDB コストが伸びる
- **緩和**: scope per token で rate limit、同一プロジェクトへの連打し c.* は client side / server side 両方で throttle

### MCP 仕様の進化
- `readOnlyHint` 等の annotation は MCP spec 進化中の要素。仕様変更リスク
- **緩和**: pm-codegen で manifest を生成しているので、単一ファイル更新で追随可

### MCP 互換クライアントのバラツキ
- Claude Desktop / Code は annotation を尊重するが、他クライアントが無視して c.* を auto-approve する可能性
- **緩和**: サーバー側の scope 分離が最終ライン、クライアントサイド UX に頗らない

## Revisit when

- ツール数が 50 を超え、`q.*` / `c.*` の 2 分類では LLM が選べなくなった（→ `q.tasks.*` といった階層グループを MCP `_meta` に追加）
- MCP spec が destruct/idempotent 以外の annotation を導入（例: cost、latency）
- 「すべてを MCP で」の制約が起こした動かなくさ（UI 独自のストリーミング、bulk import 等）を MCP で表現できないケースが増えた
- `c.*` の人間承認ステップをサーバー側で仔介したい需要（OAuth scope 超過、ワークフロー的な承認）が出た

## 関連
- ADR-0003 (AI via MCP) — 本 ADR で MCP の位置づけを AI 限定から拡張
- ADR-0005 (Monorepo) — `pm-mcp` crate を crates/ に追加
- ADR-0006 (Storage trait) — ProjectReader / ProjectWriter に分割
- ADR-0008 (Codegen) — mcp-tools.json を 4 つ目の出力に追加
- ADR-0009 (Strands → AgentCore) — yuipath-mcp は pm-mcp をクライアントとして賢く使い、推論・提案ツールに特化
