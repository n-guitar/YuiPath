# 0002: Event log を DynamoDB single-table に格納

- Status: Accepted
- Date: 2026-05-08

## Context

ダッシュボードの「アクティビティ」「未読通知」、タスクの監査履歴、MCP/AI 経由の「直近の更新を要約して」用途のために、**イベントログ（タスク・リソース・プロジェクトに対する変更履歴）を永続化する必要がある**。

要件:

- 「プロジェクト X の直近 N 日のイベント」が高速に取れる
- 「タスク Y の履歴」が高速に取れる
- 古いデータは自動的に消える（ストレージ無制限成長を避ける）
- ADR-0001 の Pattern B コスト目標（月 $5-6 / 50ユーザー）を維持
- イベントとは別に「ユーザー × イベント」の通知配信は持たない（subscription 型で読み時にフィルタする方針）

検討した選択肢:

| 案 | 月額最低 | 50ユーザー規模 | 評価 |
|---|---|---|---|
| **DynamoDB On-Demand** | **$0** | **$0.10** | **✅ 採用** |
| Aurora Serverless v2 | $87 (0.5 ACU) | $87+ | ❌ コスト目標を破壊 |
| Aurora DSQL | scale-to-zero | $5+ | △ 新しすぎる、Tokyo region 未確認 |
| RDS smallest | $13 | $13+ | △ 24/7課金 |
| S3 + Athena | $0 | $1+ | △ 更新クエリに不向き |
| Cloudflare D1 / Turso | $0 | $5+ | ✗ AWS 縛りのため除外 |

イベントログは **append-only / 時系列 / 限定アクセスパターン** という DynamoDB の強みど真ん中の用途。

## Decision

**既存の `ProjectMeta` テーブルに同居させる single-table 設計を採用。**

### スキーマ

```
Table: ProjectMeta

# 既存
PK: USER#<userid>             SK: PROJ#<projid>          → プロジェクトメタデータ
GSI1 PK: SHARED#<userid>      → SK: PROJ#<projid>        → 共有プロジェクト一覧

# 追加 (event log)
PK: PROJ#<projid>             SK: EVT#<ISOtimestamp>#<eventid>
  attrs: {
    actor:       userId,
    targetType: "task" | "resource" | "project",
    targetId:    string,
    kind:        "comment_added" | "status_changed" | "progress_updated" | ...,
    payload:     <jsonb>,        // kind-specific
    createdAt:   ISOtimestamp,
    ttl:         epochSec        // createdAt + 90d
  }

# 追加 (target別検索用 GSI)
GSI3 PK: TARGET#<targetType>#<targetId>  → SK: EVT#<ISOtimestamp>
```

### TTL

DynamoDB の TTL 属性で **90日後に自動削除**（追加コスト無料）。

90日超のデータが必要になったら、別途 S3 (Parquet) へエクスポートする batch を後付け。今は YAGNI。

### イベント vs 通知の分離

- **保存**: イベントのみ（不変、誰のものでもない）
- **通知配信**: 別途 `user_watches` (user × target) と `user_last_seen_at` を使った **subscription 型**
- ファンアウトでユーザーごとに行を作らない → 行数爆発を回避

詳細は将来 ADR で扱う（現状 mock では未実装）。

### 派生表示テキスト

イベントの `text` (例:「『UIデザイン』の進捗を 95% に更新」) は **保存しない**。`kind + payload + 関連エンティティ` から **描画時に組み立てる**。

理由:
- タスクリネームしても古い名前が残らない
- 多言語化可能
- payload から差分を構造的に参照できる（AI が解釈しやすい）

## Consequences

### Accepted (positive)
- 50ユーザー規模で **追加コスト ~$0.10/月** (Aurora の 1/870)
- TTL で自動リテンション、運用ゼロ
- 「期間 × 対象」クエリが ms 単位（PK + SK range）
- MCP/AI が「今週・来週のタスク + それらの直近更新」を低レイテンシで取れる
- single-table なので新規テーブル運用なし

### Accepted (negative)
- 複雑な集計（例: 全プロジェクト横断の月次集計）には不向き → 分析は別途 S3+Athena
- スキーマレスゆえ、新しい `kind` 追加時の payload 互換性は **アプリ層の責任**
- GSI3 を増やすと write コストが約 2倍（許容範囲）

## Risks

### ⚠️ ホットパーティション
- 同一プロジェクトで **>100 events/sec/projid** になると `PROJ#<id>` パーティションが詰まる（DynamoDB の 1パーティション 1000 WCU 制約）
- 実用上、PMツールでは到達しないが、想定外のバッチ更新（一括インポートなど）で起きうる
- **モニタ**: CloudWatch で `ThrottledRequests` を watch
- **緩和策（発動時）**: PK を日付シャーディングに変更
  ```
  PK: PROJ#<projid>#<YYYY-MM-DD>
  ```
  読み込み側は当該期間のシャードを並列 Query する

### Hot key on GSI3
- 1タスクに対する大量編集で `TARGET#task#<id>` が hot に
- 通常運用では発生しないが、AI による一括書き換えなどで起きうる
- **緩和策**: 同様に日付シャーディング、または GSI を捨てて Query 側で `targetId` フィルタする

### ペイロードサイズ
- DynamoDB の 1 item 上限 400KB
- コメント本文を payload に直書きすると稀に超える
- **対処**: コメント本文は別テーブル/S3、event payload は `commentId` のみ持つ

## Revisit when

- ユーザー1万超
- 単一プロジェクトに10万タスク超 / >10 events/sec/projid 常態化
- 横断分析（全プロジェクト集計、長期トレンド）の需要が出た（→ S3 export パイプライン構築）
- DynamoDB Streams を使ったリアルタイム集計が必要になった

## 関連 ADR
- ADR-0001: Pattern B のコスト目標（DynamoDB 採用の前提）
