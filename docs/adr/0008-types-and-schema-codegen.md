# 0008: 型・スキーマ・API 契約は Rust → TS への一方向 codegen で統一

- Status: Proposed
- Date: 2026-05-09

## Context

`pm-core`（Rust）と `apps/web`（TypeScript）で **同じ型** を使う必要がある。タスク・プロジェクト・イベント・API リクエスト/レスポンス、すべて両言語にまたがる。

手で TS 型を書くと:

- 必ずズレる（フィールド追加忘れ、optional/required の不一致）
- enum 値が文字列リテラルでズレる（`"in-progress-50"` を一方が `"in_progress_50"` にする等）
- API レスポンスの形が変わったとき、TS 側が壊れていることに runtime まで気づけない

要件:

- **single source of truth が物理的に 1 つ**
- TS 型 + JSON Schema + OpenAPI spec の 3 つを生成して使い分けたい
- runtime validation も同じ source から導けること（frontend 受信時の検証）
- CI で drift 検出（生成物が source と一致していない PR を reject）

比較:

| 案 | source of truth | TS 型 | runtime validation | API 契約 | 評価 |
|---|---|---|---|---|---|
| 手書き並行管理 | 双方 | 手書き | 手書き | 手書き | ✗ ズレる |
| Zod (TS) を起点 | TS | ✅ | ✅ | △ tRPC 等で別技術 | ✗ Rust 側に持っていけない |
| **Rust serde struct を起点 (`ts-rs` + `schemars` + `utoipa`)** | **Rust** | **✅** | **✅ (ajv)** | **✅ OpenAPI** | **✅ 採用** |
| protobuf / buf | .proto | ✅ | ✅ | ✅ gRPC | △ HTTP/JSON ストアと相性が悪い |
| OpenAPI を手書き起点 | yaml | ✅ openapi-typescript | △ | ✅ | △ 型と spec が二重管理 |

## Decision

**`pm-core` の Rust 型を唯一の source of truth とし、3 種類の出力を CI で自動生成する。**

### 生成パイプライン

```
┌──────────────────────────┐
│ crates/pm-core/src/types/ │  ← Rust struct (serde)
│   #[derive(Serialize,    │     #[derive(TS, JsonSchema)]
│            Deserialize,  │
│            TS,           │
│            JsonSchema)]  │
└────────┬─────────────────┘
         │
         ├── ts-rs       ──▶ packages/shared-types/src/*.ts        (compile-time TS)
         ├── schemars    ──▶ packages/shared-types/schemas/*.json  (JSON Schema, ajv)
         └── utoipa      ──▶ packages/shared-types/openapi.json    (OpenAPI 3.1)
                                       │
                                       └── openapi-typescript
                                              ──▶ packages/api-client/src/index.ts
                                                   (型付き fetch クライアント)
```

### 各層の役割

| レイヤ | source | 生成物 | 使用先 |
|---|---|---|---|
| Domain types | `pm-core/src/types/*.rs` | TS 型定義 (`.d.ts` 相当) | `apps/web` 全域 (compile-time) |
| Validation | 同上（`#[derive(JsonSchema)]`） | JSON Schema | frontend 受信時 ajv 検証、CSV import |
| HTTP contract | `pm-api/src/routes/*.rs` の `#[utoipa::path(...)]` | OpenAPI 3.1 | `api-client` 自動生成 |

### 駆動方法

```bash
# 全部まとめて再生成（pm-codegen crate）
cargo run -p pm-codegen

# CI: 生成 → diff チェック
cargo run -p pm-codegen
git diff --exit-code packages/shared-types packages/api-client \
  || (echo "codegen drift detected" && exit 1)
```

生成物は **コミットする**（`.gitignore` に入れない）。理由:

- IDE が即座に型補完できる（ビルド前でも）
- contributor が `cargo run -p pm-codegen` を忘れた場合、CI が即座に検知
- レビュー時に「型がどう変わったか」が PR diff で読める

### Enum / discriminated union の扱い

Rust 側:

```rust
#[derive(Serialize, Deserialize, TS, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    StatusChanged { task_id: TaskId, from: Status, to: Status },
    ProgressUpdated { task_id: TaskId, progress: u8 },
    CommentAdded { task_id: TaskId, comment_id: CommentId },
}
```

生成 TS:

```ts
export type Event =
  | { kind: "status_changed"; task_id: string; from: Status; to: Status }
  | { kind: "progress_updated"; task_id: string; progress: number }
  | { kind: "comment_added"; task_id: string; comment_id: string };
```

`#[serde(tag = "kind")]` をデフォルトとし、frontend で `switch (event.kind)` のexhaustiveness checking が効く。

### `pm-core-wasm` 経由で TS 側でロジックも再利用

型だけでなく、**critical path 計算 / working-day arithmetic / detector 評価** など pm-core のロジックは `pm-core-wasm` 経由で frontend からも呼べる。frontend で同じ計算結果を再現する必要がなく、Rust 実装が唯一の真実になる。

```
Gantt component (TSX) ──▶ pm-core-wasm.compute_critical_path(tasks)
                            └─ Rust pm-core 実装そのまま
```

これにより「frontend で軽量計算を JS で再実装 → 本番計算と微妙にズレる」という古典的バグを構造的に回避する。

## Consequences

### Accepted (positive)
- 型のズレが構造的に発生不可（Rust → TS 一方向）
- フィールド追加が `pm-core` の struct への 1 行追加と CI コマンド 1 発で完結
- API 契約変更時、frontend のコンパイルエラーで即座に呼び出し漏れを検出
- AI / MCP server (ADR-0003) も生成された JSON Schema を参照できる（プロトコル整合に有用）
- frontend のビジネスロジックが「WASM 呼び出し」に標準化、再実装重複ゼロ

### Accepted (negative)
- ts-rs / schemars / utoipa の 3 ライブラリの相互整合性に注意が必要（命名規則・generic 対応の差）
- Rust 型に `#[derive(TS, JsonSchema)]` 等が増え、`pm-core` のヘッダが賑やかになる（`#[cfg_attr(feature = "codegen", derive(...))]` で本番ビルドからは外す）
- WASM bundle サイズに注意（`wasm-opt -Oz` 必須、目標 < 500KB gzip）

## Risks

### ts-rs の表現力不足
- ts-rs は generics や lifetime が複雑な struct で破綻することがある
- **緩和**: `pm-core/src/types/` は **DTO 専用モジュール** とし、生成対象は plain struct/enum のみに絞る。内部実装には別 struct を使う

### codegen drift CI の偽陽性
- 開発機の改行コード差・フォーマッタバージョン差で CI が落ちる
- **緩和**: codegen は固定 toolchain（rust-toolchain.toml で pin）、生成後 `prettier` / `rustfmt` を強制

### WASM bundle サイズ肥大
- 全 pm-core を WASM 化すると 1MB を超える可能性
- **緩和**: `pm-core-wasm` で `#[wasm_bindgen]` する関数を厳選（critical path / detectors / working-day のみ）。シリアライズは `serde-wasm-bindgen` で型安全に

## Revisit when

- Rust 側で TS 表現できない型（HKT / 高度な generics）が必要になり、ts-rs が破綻
- gRPC / protobuf に切り替えたいユースケース（外部統合、大規模ストリーミング）
- frontend が独自 client framework（SolidJS / Svelte 等）に移行（→ openapi-typescript の対応状況を確認）
- AI / MCP 用に専用スキーマ表現が必要になった（→ JSON Schema 拡張 or 独自 IDL）

## 関連
- ADR-0003 (AI via MCP — JSON Schema を MCP tool 定義にも流用)
- ADR-0005 (Monorepo)
- ADR-0006 (Storage trait — DTO 型がここでも使われる)
