# 0001: Deployment patterns (Tauri ローカル + AWS クラウド)

- Status: Accepted
- Date: 2026-05-08

## Context

YuiPath は MS Project / ProjectLibre 代替の OSS PM ツール。配布形態を決める必要がある。

ProjectLibre は Java デスクトップ + 独自 Cloud SaaS の2系統。我々は以下を要件とした:

- 完全ローカル動作（オフライン・プライバシー優先のユーザー向け）
- 低コスト SaaS 動作（個人・小規模組織向け、月数ドル以下が目標）
- **同じコードベースで両方をカバーしたい**（保守コストを最小化）
- AI 機能はオプション（核には含めない、後述 ADR-0003）

検討した選択肢:

| 案 | デスクトップ | クラウド | 共通化 | 評価 |
|---|---|---|---|---|
| Electron + Node | ◎ | △ | ○ | バイナリ重い (~150MB)、Lambda Cold start 遅 |
| Tauri + Rust | ◎ (10-20MB) | ◎ (Rust→Lambda) | ◎ | コア計算をRust→WASMで統一可能 |
| Web only | ✗ | ◎ | - | オフライン要件を満たせない |
| ネイティブ (Swift/.NET) | ◎ | ✗ | ✗ | 共通化不可、人件費爆発 |

## Decision

**Pattern A (ローカル) と Pattern B (クラウド) の2系統を並行サポート。両者で 95% のコードを共有する。**

### Pattern A: 完全ローカル
- Desktop shell: **Tauri 2.0** (Rust)
- Frontend: React + TypeScript + Vite
- Local DB: SQLite (Tauri SQL plugin)
- PM 計算コア: Rust crate (`pm-core`)

### Pattern B: AWS 最安構成
- 静的配信: CloudFront + S3
- API: API Gateway HTTP API + Lambda (Rust)
- DB: DynamoDB On-Demand (詳細は ADR-0002)
- ファイルストレージ: S3 (プロジェクトJSON本体)
- 認証: Cognito User Pool

### 共通コア
- TypeScript 型定義 (`shared/types/`)
- Rust crate `pm-core` を **WASM 出力**して、ブラウザでも Tauri でも Lambda でも同じ実装を使う
- React コンポーネント (`shared/ui/`)
- ストレージ抽象化 (`shared/storage/local.ts` vs `cloud.ts`、ビルドフラグで切替)

## Consequences

### Accepted (positive)
- 同一機能を2パターンで提供できる（ユーザーが選べる）
- Rust + WASM により Lambda の Cold start が ms 単位（vs JVM/Node の秒単位）
- Pattern B のコスト目標 50ユーザーで月 $5-6 を達成可能（Aurora 等の常時課金 RDB を回避）
- OSS としてフォーク・自社運用しやすい（重い前提を持たない）

### Accepted (negative)
- Tauri / Rust / WASM の学習コストが Node + Electron より高い
- WASM 経由のため、JS-Rust 境界で型変換オーバーヘッドが発生（Hot path で要計測）
- DOM 操作系のフロントエンド機能（Drag & drop 等）は Tauri/Web で実装が分かれる場合あり

## Risks

### Tauri エコシステム成熟度
- Tauri 2.0 は GA だが、プラグインや配布ツールは Electron ほど枯れていない
- **トリガー**: 重大なリリース blocker に当たった場合、Wails (Go) や Electron へ撤退も視野
- 現状リスク: 中

### MPP (MS Project) ファイル互換
- mpxj (LGPL Java) を移植 or サイドカー実行が必要
- リバースエンジニアリングのみの非公式形式なので完全互換は困難
- **対処**: MVP では JSON / XML / CSV のみ対応、MPP は Phase 4

## Revisit when

- Tauri 2.x で重大な互換性問題が発生
- AWS Lambda の代替（Cloudflare Workers 等）の方がコスト/レイテンシで明らかに優位になった
- ユーザーから「ブラウザのみで使いたい、Desktop 不要」が大多数になった（Pattern A の意義低下）
