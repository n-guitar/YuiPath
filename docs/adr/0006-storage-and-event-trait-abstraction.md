# 0006: Storage と Event Log を trait で抽象化

- Status: Proposed
- Date: 2026-05-09

## Context

ADR-0001 で Pattern A（SQLite ローカル）と Pattern B（DynamoDB クラウド）を並行サポートすることを決めた。`pm-api`（HTTP handler 群）が SQLite / DynamoDB のどちらに対しても **同一コードで動く** 仕組みが必要。

要件:

- handler は具象データストアを知らない（pm-api → SQLite を直接 import するのは禁止）
- Pattern A はオフラインで動く（ネットワーク不可前提）
- Pattern B はマルチユーザー、楽観ロック必須（タスク同時編集の整合性）
- Event Log は **pm-tasks など他のテーブルと別寿命** （TTL あり、append-only）→ 別 trait に分ける
- 単体テストで in-memory 実装を差し込めること

比較した抽象化粒度:

| 案 | 評価 |
|---|---|
| trait なし（feature flag で実装切替） | ✗ コンパイル時切替で両方の整合性チェックが落ちる |
| 1 つの巨大 trait `Repo` | △ Event は寿命が違うので分離したい |
| **Repository 層を 2 trait (`ProjectStore` + `EventLog`)** | **✅ 採用** |
| ORM (sqlx / sea-orm) を直接使う | ✗ DynamoDB は別世界、ORM が効かない |
| GraphQL レイヤで抽象化 | ✗ overkill、Pattern A で GraphQL サーバー要らない |

## Decision

**`pm-storage` crate に 2 つの trait を定義し、Pattern A/B で別実装を提供する。**

### `ProjectStore` trait（プロジェクト・タスク・リソース・コメント等の永続化）

```rust
#[async_trait]
pub trait ProjectStore: Send + Sync + 'static {
    // Projects
    async fn list_projects(&self, owner: &UserId) -> Result<Vec<Project>>;
    async fn get_project(&self, id: &ProjectId) -> Result<Option<Project>>;
    async fn put_project(&self, p: &Project, expected_version: Option<u64>) -> Result<u64>;
    async fn delete_project(&self, id: &ProjectId) -> Result<()>;

    // Tasks (同一 project 内の bulk read)
    async fn list_tasks(&self, project: &ProjectId) -> Result<Vec<Task>>;
    async fn put_tasks(&self, project: &ProjectId, tasks: &[Task]) -> Result<()>;

    // Resources / Comments / Calendars も同様（省略）
    // ...
}
```

#### 設計上のポイント

- **`expected_version` で楽観ロック**: Pattern B では DynamoDB ConditionExpression、Pattern A では SQLite の UPDATE WHERE version = ?
- **bulk read/write を基本にする**: DynamoDB は 1 タスク = 1 item にすると Read/Write Capacity が爆発する。プロジェクト単位の TransactWriteItems（最大 100 アイテム）を前提に設計
- **行単位ではなくドメイン単位**: `find_task_by_id(id)` のような handler 起点クエリは不要（あれば pm-api 内で `list_tasks().find(id)`）。ストレージ層の API 表面を最小化

### `EventLog` trait（イベントログ、ADR-0002）

```rust
#[async_trait]
pub trait EventLog: Send + Sync + 'static {
    async fn append(&self, event: &Event) -> Result<()>;
    async fn list_by_project(
        &self, project: &ProjectId, range: TimeRange, limit: usize,
    ) -> Result<Vec<Event>>;
    async fn list_by_target(
        &self, target: &TargetRef, range: TimeRange, limit: usize,
    ) -> Result<Vec<Event>>;
}
```

- ADR-0002 のスキーマ（`PROJ#<id>` PK + `EVT#<ts>` SK + GSI3 on target）を反映
- TTL は実装側責務（DynamoDB は属性 `ttl`、SQLite は `DELETE WHERE created_at < ...` バッチ）

### `Authenticator` trait（認証コンテキスト解決）

```rust
#[async_trait]
pub trait Authenticator: Send + Sync + 'static {
    async fn resolve(&self, headers: &HeaderMap) -> Result<AuthContext, AuthError>;
}

pub struct AuthContext {
    pub user_id: UserId,
    pub org_id: OrgId,
    pub scopes: Vec<Scope>,
}
```

- Pattern B 実装: `CognitoJwtAuth`（JWKS を起動時にキャッシュ、JWT 検証）
- Pattern A 実装: `LocalDeviceAuth`（OS Keychain / DPAPI に保存したデバイス鍵で署名された短命トークンを検証）
- ローカル開発実装: `DevJwtAuth`（HS256 共有秘密、開発環境のみ）

### 実装マッピング

| crate | 実装 | 利用シーン |
|---|---|---|
| `pm-storage-sqlite` | `SqliteProjectStore`, `SqliteEventLog` | Pattern A、ローカル開発 (LocalStack なし高速モード) |
| `pm-storage-dynamodb` | `DynamoProjectStore`, `DynamoEventLog` | Pattern B 本番、LocalStack 開発 |
| `pm-storage-mem` | `InMemoryProjectStore` 等 | 単体テスト |

### DI（pm-api への注入）

```rust
pub struct AppState {
    pub projects: Arc<dyn ProjectStore>,
    pub events:   Arc<dyn EventLog>,
    pub auth:     Arc<dyn Authenticator>,
}

pub fn router(state: AppState) -> axum::Router { /* ... */ }
```

`pm-lambda` / `pm-tauri` がそれぞれの環境変数から具象実装を作って `AppState` を組み立てる。pm-api 自体は具象を一切知らない。

## Consequences

### Accepted (positive)
- pm-api のテストが `InMemoryProjectStore` で完結（DB 起動不要、ms 単位）
- 将来 Cloudflare D1 / Turso / Postgres を追加する時、新 crate 1 つで済む
- Pattern A/B 切替が「`Arc<dyn>` の差し替え」だけなので、コンパイル時 feature flag による地雷を避けられる
- OnboardX が `packages/backend/` に DynamoDB アクセスを集約していたパターンを **trait 強制** で更に堅くする

### Accepted (negative)
- `async_trait` のオーバーヘッド（box::pin allocation 1 回 / 呼び出し）。実用上は無視できるレベルだが、計測対象
- DynamoDB 固有の最適化（BatchGetItem の 100 件分割、TransactWriteItems の 100 件制限）が trait 表面に染み出る誘惑がある → 防ぐために trait は「ドメイン操作」の語彙だけで定義し、バッチ分割は実装側に閉じる
- 楽観ロック (`expected_version`) のセマンティクスを SQLite / DynamoDB で完全一致させるのに注意（テストで両実装に同じケースを通す）

## Risks

### trait 表面の腐敗
- handler が「ちょっとした便利メソッド」を trait に追加し続けると、SQLite/DynamoDB 両方で実装する負担が爆発
- **緩和**: trait 追加には必ず両実装 + テストの追加を必須にする CI ルール（`cargo test --all-features --workspace`）

### N+1 問題
- ドメイン語彙にこだわると、handler 側が `for project in projects { list_tasks(project) }` のようなコードを書きがち
- **緩和**: `list_projects_with_tasks(...)` のような complete-by-context API を必要に応じて追加（**bulk 単位を増やす方向**）。1 タスク 1 fetch は禁じ手

### Pattern A の同時編集（複数ウィンドウ）
- Tauri は同一プロセス内で動く想定だが、ユーザーが 2 インスタンス起動するケース
- **対処**: SQLite は WAL モード + ファイルロック、`expected_version` で衝突検出

## Revisit when

- DynamoDB の TransactWriteItems 100 件制限を超える単位の更新が頻発（→ 設計見直し / saga 化）
- 新しいストレージ要件（フルテキスト検索、グラフ DB）が出た（→ trait を増やす or 別レイヤを切る）
- Pattern A の同期機能（複数デバイス間の eventually-consistent 同期）が必要になった（→ EventLog を CRDT ベースに拡張）

## 関連
- ADR-0001 (Deployment patterns)
- ADR-0002 (Event log on DynamoDB)
- ADR-0005 (Monorepo workspace layout)
