# 0005: Monorepo workspace layout (Cargo + pnpm)

- Status: Proposed
- Date: 2026-05-09

## Context

ADR-0001 で「Pattern A (Tauri ローカル) + Pattern B (AWS) を並行サポート、95% のコードを共有」を決定した。実装 phase に入るにあたり、**どこに何を置くか / どうビルドするか** を決める必要がある。

要件:

- Rust crate（`pm-core`, WASM ラッパー, Lambda バイナリ, Tauri commands, ストレージ実装）と TS パッケージ（React SPA, CDK app, 共有型）が **同一リポジトリ内で相互参照** できる
- Tauri は Rust + JS の両方を必要とするため、片方だけの workspace では成立しない
- 単一 PR で「Rust 側 API 変更 + TS 側 client 修正 + CDK 側 IAM ポリシー追加」が**原子的に**できる
- OSS contributor の入り口を浅く保つ（学習コスト、`make dev` で立ち上がる）

比較:

| Option | Rust 共有 | JS 共有 | Tauri 統合 | CI 速度 | 学習コスト |
|---|---|---|---|---|---|
| 別リポジトリ × N | △ git submodule 地獄 | △ | ✗ | ✗ | 高 |
| polyrepo + npm パッケージ公開 | △ crates.io 公開必須 | ◎ | ✗ | ◎ | 中 |
| **monorepo (Cargo workspace + pnpm workspace)** | ◎ | ◎ | ◎ | ◎ | 低 |
| monorepo + Nx / Turborepo | ◎ | ◎ | ◎ | ◎+ | △ |

Nx / Turborepo はタスク依存グラフが必要になってからで遅くない（YAGNI）。Cargo の `workspace` + pnpm の `workspaces` で当面足りる。

## Decision

**単一リポジトリに Cargo workspace と pnpm workspace を共存させる。**

```
yuipath/
├── Cargo.toml                  # workspace.members = ["crates/*"]
├── pnpm-workspace.yaml         # packages: ["apps/*", "packages/*"]
├── crates/
│   ├── pm-core/                # ピュアな PM ドメインロジック
│   │                           #   - 型 (Task, Project, Resource, ...) + serde
│   │                           #   - working-day arithmetic
│   │                           #   - critical path / dependency resolution
│   │                           #   - status taxonomy / detector framework
│   │                           #   no_std を可能な限り維持、I/O なし
│   ├── pm-core-wasm/           # wasm-bindgen / web-sys ラッパー
│   ├── pm-storage/             # ストレージ trait 定義 (ADR-0006)
│   ├── pm-storage-sqlite/      # Pattern A 実装 (rusqlite)
│   ├── pm-storage-dynamodb/    # Pattern B 実装 (aws-sdk-dynamodb)
│   ├── pm-events/              # Event Log trait + 実装 (ADR-0002)
│   ├── pm-api/                 # framework-agnostic HTTP handler 定義
│   │                           #   - axum::Router を返す関数群
│   │                           #   - ProjectStore / EventLog / Authenticator trait に依存
│   │                           #   - tokio + axum 以外に環境固有依存なし
│   ├── pm-lambda/              # Pattern B バイナリ (lambda_http で pm-api を起動)
│   ├── pm-tauri/               # Tauri commands (pm-api を内部で再利用)
│   └── pm-codegen/             # ts-rs + schemars + utoipa の出力ドライバ
├── apps/
│   ├── web/                    # React + Vite SPA (Pattern A/B 共通)
│   ├── tauri/                  # Tauri shell (Cargo crate + tauri.conf.json)
│   └── infra-cdk/              # AWS CDK v2 (TypeScript) NestedStack 構成
├── packages/
│   ├── shared-types/           # ts-rs / schemars 出力先 (生成物)
│   └── api-client/             # openapi-typescript で生成した HTTP client
├── tools/
│   ├── dev/                    # docker-compose, init-localstack.sh
│   └── seed/                   # 初期データ投入スクリプト
├── docker-compose.yml          # ローカル開発 (LocalStack + cargo lambda watch)
├── docker-compose.onprem.yml   # オンプレ配布 (Lambda RIE + LocalStack + Nginx)
├── docs/adr/
├── CLAUDE.md
├── LICENSE / NOTICE / TRADEMARKS.md
└── mock/                       # 既存モックは UX spec として保持
```

### crate 依存方向の不変条件

```
pm-core ─────────┐
  ↑              │
pm-storage       │
  ↑   ↑          ↓
sqlite dynamodb  pm-events
         ↑          ↑
         └─pm-api───┘
             ↑
   ┌─────────┴─────────┐
pm-lambda           pm-tauri
```

- `pm-core` は他のどの crate にも依存しない（純粋ドメイン）
- `pm-api` はストレージ・イベント・認証を **trait** 経由でしか触らない（具象実装に依存しない）
- 具象実装 (`pm-lambda`, `pm-tauri`) が DI コンテナ的に組み立てる

この方向性により、`pm-api` のテストは in-memory mock storage で完結し、AWS / SQLite / Tauri を起動せずに動作確認できる。

## Consequences

### Accepted (positive)
- API 契約の変更が単一 PR で全レイヤを横断できる（pm-core 型変更 → 自動 codegen → web client 修正 → CDK IAM 追加）
- `pm-api` が framework-agnostic なため、将来 Pattern C（Cloudflare Workers, セルフホスト Express など）が来ても crate 1 つ追加で済む
- Tauri 開発時に Rust crate を `path = "../pm-api"` で即時参照、`cargo watch` がそのまま効く
- OnboardX の `event-builder.ts`（Express ↔ Lambda event 変換）相当のアダプタ層が不要。pm-api が axum::Router を返すので Lambda / Tauri は同じ `Router` をそのまま起動する

### Accepted (negative)
- リポジトリサイズが大きい（初学者は最初 `crates/pm-core` だけ読めば良いことを CLAUDE.md で誘導）
- Cargo / pnpm / Tauri / CDK の 4 種類のビルドツールを CI で扱う必要がある
- IDE（rust-analyzer + TypeScript LSP）が両方走るのでローカルメモリを食う

## Risks

### Cargo と pnpm の lock ファイルが両方更新される PR レビュー疲れ
- **緩和**: `Cargo.lock` と `pnpm-lock.yaml` は CODEOWNERS で reviewer 自動アサイン、目視 diff レビュー不要に

### Tauri 依存（`apps/tauri/`）が Cargo workspace に入ることによるビルド汚染
- Tauri は OS 依存の native deps（`webkit2gtk` 等）を要求する
- **緩和**: `apps/tauri/Cargo.toml` は workspace member だが、`pm-lambda` のクロスコンパイル（Linux ARM64）には不要。CI ジョブを分割

### サブプロジェクト単位での OSS 引用
- contributor が「pm-core だけ別 crates.io に publish したい」と言い出した場合、monorepo は不利
- **対処**: 必要になったら `cargo publish -p pm-core` で part publish 可能。リポジトリ分割は最後の手段

## Revisit when

- crate / package 数が 30 を超え、ビルド時間が CI で 15 分を超えた（→ Turborepo / cargo-nextest / sccache 検討）
- `pm-core` を独立 OSS として publish したい強い需要が出た（→ submodule 化）
- 公式 plugin エコシステムを発足させる時（→ plugins/ サブツリーを別 workspace に）

## 関連
- ADR-0001 (Deployment patterns)
- ADR-0006 (Storage trait)
- ADR-0007 (Local dev environment)
- ADR-0008 (Type / schema codegen)
