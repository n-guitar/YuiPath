# 0007: ローカル開発環境（cargo-lambda + LocalStack）

- Status: Proposed
- Date: 2026-05-09

## Context

Pattern B (AWS) を AWS アカウントなしでも開発・検証できるようにしたい。要件:

- AWS アカウント不要で全機能（DynamoDB / S3 / 認証 / Lambda）を動かせる
- **ローカルで動く Lambda は本番と同じバイナリ**であること（ランタイム差異の罠を防ぐ）
- 起動コスト 1 分以内、コード変更から再実行まで数秒
- オンプレ配布（顧客が AWS を使えない場合）にも同じ仕組みを流用できる
- Pattern A の高速開発（Tauri）はサーバー不要なのでこの ADR の対象外

参考にした OnboardX の選択（n-guitar/yuipath とは別プロダクト）:

- `packages/server/` で **Express がランタイム**となり、Lambda の TS ハンドラを `import` して `req → Lambda event` 変換層を挟む
- これは「Lambda のソースを 1 行も変えない」を達成する強力な発想だが、**ランタイム自体は Lambda ではなく Node.js + Express** であり、本番の API Gateway / Lambda の挙動と完全一致はしない（タイムアウト / レスポンスサイズ制約 / payload エンコーディング差等）
- TypeScript Lambda 限定の技。**YuiPath は Rust Lambda（ADR-0001）なのでこのまま使えない**

比較した選択肢:

| 案 | 本番一致度 | 速度 | AWS 不要 | 評価 |
|---|---|---|---|---|
| **`cargo lambda watch`**（Lambda Runtime API エミュレータ） | ◎ 同一バイナリ | ◎ ms 再起動 | ✅ | **✅ 採用 (Tier 1)** |
| **AWS Lambda Runtime Interface Emulator (RIE) Docker** | ◎◎ 本番イメージそのまま | ○ 数秒 | ✅ | **✅ 採用 (Tier 2)** |
| Express で axum を再ホスト | △ ランタイム別物 | ◎ | ✅ | ✗ |
| LocalStack Lambda (Pro) | ◎ | ○ | ✅ | ✗ Pro 課金 |
| AWS Lambda 直接（dev account） | ◎◎◎ | ✗ 数十秒 / iter | ✗ | ✗ contributor 友好でない |
| SAM CLI (`sam local start-api`) | ○ Docker 経由 | △ | ✅ | △ 重い、Rust 対応経験少 |

`cargo lambda` は Lambda Runtime API を実装した dev サーバーを立ち上げ、Lambda 本番バイナリ（cross-compiled `bootstrap`）を起動する。コード変更で再ビルド + 再起動。本番と同じ runtime API を喋る。

## Decision

**Pattern B のローカル開発を 3 ティアで提供する。**

### Tier 1 — pm-api 単体 + SQLite（最速イテレーション）

```bash
cargo run -p pm-api-dev   # axum dev server, ProjectStore = SQLite
```

- DynamoDB をエミュレートしない。`pm-storage-sqlite` を直接注入
- 用途: HTTP 契約・handler ロジック・frontend 統合の開発
- LocalStack 不要、Docker 不要、`cargo run` だけで起動
- **DynamoDB 固有の挙動（楽観ロック、ConditionExpression）は確認できない** ことを CLAUDE.md に明記

### Tier 2 — `cargo lambda watch` + LocalStack（DynamoDB 契約確認）

```bash
docker compose up -d localstack
cargo lambda watch -p pm-lambda
```

- `pm-lambda` を Lambda Runtime API 経由で起動
- `ProjectStore = DynamoDB`（LocalStack エンドポイント `http://localhost:4566`）
- 用途: DynamoDB 単一テーブル設計・GSI3 クエリ・TTL の検証
- 認証は `Authenticator = DevJwtAuth`（HS256 共有秘密）

### Tier 3 — Lambda RIE Docker + LocalStack（パッケージング契約確認）

```bash
docker compose -f docker-compose.lambda-rie.yml up
```

- 本番と同じ `provided.al2023` ベースイメージ + cross-compiled `bootstrap`
- 用途: バイナリサイズ・cold start・layer 設定の検証、本番と同じ aws-lc / TLS / 動的リンクの確認
- CI で常時実行（PR ごとに統合テスト）

### LocalStack でカバーするサービス

| サービス | LocalStack Community | 採用 | 備考 |
|---|---|---|---|
| DynamoDB | ✅ | ✅ | 完全互換 |
| S3 | ✅ | ✅ | presigned URL 含む |
| Cognito | △ 部分 | ✗ | LocalStack の Cognito は機能不完全 → `DevJwtAuth` でバイパス |
| API Gateway | △ | ✗ | Lambda RIE が直接 HTTP を喋るので不要 |
| CloudWatch Logs | ✅ | △ | デバッグ時のみ |

Cognito 互換認証はローカル開発では諦め、`Authenticator` trait（ADR-0006）の差し替えで対応する。本番デプロイ前に dev account で疎通する CI ジョブを別途用意する。

### オンプレ配布（docker-compose.onprem.yml）

Tier 3 構成をそのままパッケージング:

```
┌──────────┐    ┌───────────────────┐    ┌─────────────┐
│ Browser  │───▶│ Nginx :8080       │    │ LocalStack  │
│          │    │ /        → SPA    │    │ DynamoDB/S3 │
│          │    │ /api/    → RIE    │    └─────────────┘
│          │    │ /s3/     → Local  │           ▲
│          │    └────────┬──────────┘           │
│          │             ▼                      │
│          │    ┌───────────────────┐           │
│          │    │ Lambda RIE        │───────────┘
│          │    │ (pm-lambda 同一バイナリ) │
│          │    └───────────────────┘
└──────────┘
```

オンプレ顧客は `docker compose -f docker-compose.onprem.yml up` で完結。AWS アカウント不要、AWS リソース ID 不要。`Authenticator` は `DevJwtAuth` を本番グレード設定（強い秘密 + 短命トークン）で運用する、または将来 `OidcAuth` を実装する。

## Consequences

### Accepted (positive)
- 「ローカルで動いた = 本番でも動く」一致度が極めて高い（Tier 3 は同一バイナリ）
- contributor の入り口が `docker compose up` のみ。AWS 知識不要で frontend / API 改修ができる
- Pattern A 開発は Tier 0 として `cargo run -p pm-tauri` のみ（サーバーレス）。両方に共通で `pm-api` を共有しているので、ロジックは 1 度書けば両方で動く
- Lambda RIE のおかげでオンプレ配布が「ほぼタダ」で得られる（本番ビルド成果物の再利用）

### Accepted (negative)
- Tier 3 はビルド時間が長め（Rust release build + cross compile）。ローカル iteration には Tier 1 を使う運用が必要
- LocalStack の Cognito 不対応により、認証層は本番と差異がある（`DevJwtAuth` vs `CognitoJwtAuth`）。E2E は dev account に頼る
- 3 ティア運用の認知コスト → CLAUDE.md と `docs/dev-guide.md` で「いつどれを使うか」を明示

## Risks

### LocalStack DynamoDB の挙動差
- 既知バグ: ConditionalCheckFailedException のメッセージフォーマット差、TransactWriteItems のエラー種別が稀に AWS と異なる
- **緩和**: 統合テストは Tier 3 + LocalStack で回しつつ、staging に dev account を 1 つ持ち、リリース前に必ず通す

### `cargo lambda watch` の安定性
- まだ若いツール（`cargo-lambda` v1.x、活発に開発中）
- **緩和**: Tier 2 がコケた場合の fallback として Tier 3（RIE Docker）を常に使えるようにする。version pin

### onprem 配布の認証
- `DevJwtAuth` をそのまま本番運用するのはセキュリティ的に不十分（鍵ローテーション・OIDC 連携・MFA なし）
- **対処**: onprem 顧客向けには `OidcAuth`（Keycloak / Auth0 / Entra ID）実装を将来 ADR で追加。当面は SMB / 個人ユース限定と明記

## Revisit when

- LocalStack Pro（Cognito 完全互換）が個人 OSS 用ライセンスで使えるようになった
- AWS が Lambda の公式ローカル実行環境を改善（SAM CLI が Rust First-class になる等）
- onprem ユーザーが大規模化し、`OidcAuth` 実装を急ぐ必要が出た
- `cargo-lambda` がメンテ停止 / 大幅破壊変更（→ RIE Docker に一本化）

## 関連
- ADR-0001 (Deployment patterns)
- ADR-0002 (Event log on DynamoDB)
- ADR-0006 (Storage / Auth trait)
