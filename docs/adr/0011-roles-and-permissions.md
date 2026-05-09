# 0011: ロールと権限分離

- Status: Proposed
- Date: 2026-05-09
- Updated: 2026-05-09 (mock 分析後の訂正、ADR-0012 と並行確定)
- Related: ADR-0010 (MCP-first と read/write 分離), ADR-0012 (ドメインエンティティ確定)

## Context

ADR-0010 で read/write scope を分離したが、**「誰が何をできるか」のロール体系は未定義だった**。

ユーザー要件（2026-05-09 設計セッション）:

- ロールはシンプルに
- システム管理者とプロジェクトメンバーだけで多分足りる
- メンバーは「自分のタスクだけ」更新・削除できれば良い
- MCP を含めて、表示範囲とできる/できないを一度検討してまとめてほしい

考慮した論点:

- system_admin を設けるか → 設ける（Pattern B では運営・コンプライアンス・サポートに不可欠、Org 概念を後付けで入れる軽量ストップとしても有効）
- Org / Workspace 階層は作らない（シンプルさ優先、必要になった時点で ADR で検討）
- system_admin はデータ閲覧を escalation 制にするか → **しない**。信頼前提、event log で足りる
- 複数 admin・ロール変更を許すか → 両方許す（単独 admin は SPOF、組織は変わる）

訂正履歴（2026-05-09 追記）:

- mock/project/data.jsx 分析により、「Resource」と「Member」は同一概念と確定。本 ADR では **Member** で統一
- mock に「独立 calendar event entity」は存在しないため、当初記載した Calendar event の権限行を削除
- 「自分のタスク」 = `task.owner == self OR self ∈ task.subs` と明記

## Decision

### ロールは 3 つ、フラット

```
system_admin     インスタンス全権（運営者）
project_admin    そのプロジェクトの全権
project_member   そのプロジェクトの参加者
```

- 階層概念（Org / Workspace）は作らない
- ユーザーは `is_system_admin: bool` + 各プロジェクトへの `Membership { role: admin | member }` を持つ
- これ以外のロール（viewer / billing / auditor などの細分化）は現時点で作らない

### 原則: 読みは緩く、書きは厳しく

#### 読み

| ロール | 見える範囲 |
|---|---|
| system_admin | 全プロジェクトの全データ（タスク本文・コメント含む） |
| project_admin / member | 所属プロジェクトの全データ |
| 非所属 | 何も見えない |

権限を細切れにしない。見える/見えないの線は **プロジェクト所属の有無 + system_admin フラグ** だけ。Event Log (監査ログ) も同じルールで見える。

#### 書き

唯一の原則:

> **「自分のものだけ書ける。admin は他人のものも書ける。」**

**「自分の task」の定義** (重要):

```
task が 「自分のもの」 ⇔ task.owner == self OR self ∈ task.subs
```

- owner (主担当) だけでなく subs (副担当) も含む。副担当も実務的にタスクを進めるため
- creator (作成者) は権限に関係しない。移譲後の責任所在を owner/subs に一元化

| 書込対象 | system_admin | project_admin | project_member |
|---|---|---|---|
| プロジェクト設定 (名前・説明・外見・カレンダーテンプレート) | ✓ (全) | ✓ (自プロジェクト) | ✗ |
| Member 追加/削除/ロール変更 | ✓ | ✓ (自プロジェクト) | ✗ |
| 任意の task ・ comment の CRUD（他人作成も含む） | ✓ | ✓ (自プロジェクト) | ✗ |
| 「自分の task」 (owner OR subs) の更新/削除 | ✓ | ✓ | ✓ |
| 自分の comment の編集/削除 | ✓ | ✓ | ✓ |
| task の作成 (owner = self or 未割当) | ✓ | ✓ | ✓ |
| task の owner / subs 変更 (他人への振り替え) | ✓ | ✓ | ✗※ |
| 自分を owner/subs から外す (未割当 or subs 除去) | ✓ | ✓ | ✓ |
| Event Log の書込 | (全て自動、API なし) | — | — |

※ project_member は、「自分を外す」方向のみ可。他人への振り替えは admin 権限。

※※ Calendar event は独立エンティティとして存在しないため、本表から削除した。スケジュール関連は全て task と CalendarTemplate で表現 (ADR-0012 参照)。

### 複数 admin・ロール変更

#### 複数 admin は許可

- system_admin も project_admin も複数人 OK
- 単独 admin = SPOF（退職・休暇・アカウント侵害）を避ける

#### ロール変更 4 ルール

1. **最後の admin は降格・削除不可**
   - system_admin がインスタンス中で 1 人なら、その system_admin フラグは外せない
   - project_admin がプロジェクトで 1 人なら、その人を降格・除名できない
   - 解除したい場合は「他を先に昇格 → その後で自分を降格」

2. **自分の昇格は不可（降格は可）**
   - project_member が「自分を project_admin に」は不可
   - admin が「もう外れたい」は可（ルール 1 の範囲内）

3. **昇格・降格は同等以上のロールが実行**
   | 操作 | 実行可能なロール |
   |---|---|
   | project_member ↔ project_admin | project_admin or system_admin |
   | system_admin の付与・剥奪 | system_admin のみ |

4. **ロール変更は必ず Event Log に記録**
   - 誰が、いつ、誰のロールを、何から何に変えたか
   - これで監査要件を満たす

#### ユーザー脱退時の振舞い

| 状況 | 振舞い |
|---|---|
| project_member が脱退 | OK。owner / subs に含まれていた task は orphan flag が立ち、admin が再アサイン |
| project_admin が脱退（他にも admin あり） | OK |
| project_admin が脱退（最後の 1 人） | ブロック。先に他メンバーを admin にする必要 |
| system_admin が退会（他にもいる） | OK |
| system_admin が退会（最後の 1 人） | ブロック |

### system_admin は何でも見える・何でもできる

- 他人のプロジェクトのタスク本文もコメントも見える
- escalation フローや同意ステップは作らない
- **信頼前提と運用責任で担保し、Event Log で事後検証可能にする**
- system_admin の読みアクセスも Event Log に記録される（「誰がいつ何を見たか」を project_admin が事後確認できる）

### MCP scope と role は別軸

| 軸 | 値 | 役割 |
|---|---|---|
| **token scope** | `read` / `write` / `admin` / `system` | クライアントに渡す鍵の上限。MCP ツール一覧をフィルタする UX 用 |
| **role** | system_admin / project_admin / project_member | サーバーが最終判断する実権限 |

最終ゲートは **常に role 側**。token scope は「何を試せるか」、role は「実際に通るか」。

#### MCP ツール名規則

```
q.*    読み                    (token: read 以上)
c.*    プロジェクト内書き         (token: write 以上)
s.*    システム書き                (token: system のみ)
```

例:

```jsonc
{
  "name": "c.tasks.update",
  "annotations": { "destructiveHint": false, "idempotentHint": true },
  "_meta": {
    "yuipath:requiredScope": "write",
    "yuipath:requiredRole": "member",
    "yuipath:ownership": "owner_or_subs_or_admin"
  }
}
{
  "name": "c.projects.set_member_role",
  "_meta": {
    "yuipath:requiredScope": "write",
    "yuipath:requiredRole": "project_admin",
    "yuipath:guards": ["not_self_promotion", "not_last_admin"]
  }
}
{
  "name": "s.users.set_system_admin",
  "_meta": {
    "yuipath:requiredScope": "system",
    "yuipath:requiredRole": "system_admin",
    "yuipath:guards": ["not_last_admin"]
  }
}
```

ツールの `tools/list` 出力は role でフィルタしない。呼んだ際に 403 を返す → LLM が「これはできない」を学べる。

### Pattern ごとの振舞い

| Pattern | 実態 | UI |
|---|---|---|
| **A (Tauri ローカル)** | 持ち主が暗黙的に system_admin かつ全プロジェクトの project_admin | ロール概念を一切出さない。「自分のアプリ」として動く |
| **B (セルフホスト)** | 初期 system_admin は env (`YUIPATH_INITIAL_SYSTEM_ADMIN=...`) で指定。以降は本人が追加可 | 設定画面に「システム管理」セクション |
| **B (SaaS)** | 運営チームが system_admin | 一般ユーザーには system_admin の存在を見せない |

**Pattern A を壊さないコツ**:
- ロール機構は Phase 1 から実装する
- Pattern A ではユーザー作成時に自動で system_admin、プロジェクト作成時に自動で project_admin
- UI で「メンバー追加」「権限変更」を出さないだけ
- **コードは同じ、UI 出し分けで済ませる**

### 不採用の設計（シンプルさを保つため）

以下は採用しない。必要になった時点で別 ADR で検討する:

- 4-eyes 承認（admin 任命に 2 人の承認が必要）
- 期限付き admin（一時的に admin になる）
- 委譲フロー（admin から member への正式な引き継ぎ手続き）
- ロール一括変更
- viewer / billing / auditor などの細分化ロール
- Org / Workspace 階層

## Consequences

### Accepted (positive)

- 覆えるルールは実質 **2 つだけ**: 「最後の admin は降格不可」「自分の昇格不可」
- 単独 admin の SPOF リスクを陥らず、複数 admin と動的ロール変更を両立
- read-only LLM bot / dashboard に `read` token を渡しただけで事故防止が効く
- system_admin の動きも Event Log で事後検証可能、信頼と透明性のバランスが取れる
- Pattern A と B でコードを分けず、UI 表示だけで出し分けられる
- 「owner OR subs」と明記したことで、副担当の勤務フローが自然に表現される

### Accepted (negative)

- system_admin は実質何でもできる → 信頼した人を選ぶ責任が運用側に集中
- escalation フローがないため、コンプライアンス要件で「データ閲覧には上位者承認が必要」と言われたら ADR 追加で対応
- viewer ロールがないため「読みだけ参加させたい人」は bot ユーザー + read scope token を採らないと表現できない
- Org / Workspace を後から入れると、ユーザー・プロジェクト・メンバーシップの関係を全体調整するマイグレーションが必要
- subs も「自分の task」に含めたため、副担当が多数設定されると「複数人が全員書込める」状態になる → ADR-0010 の expected_version (optimistic locking) でコンフリクト検出

## Risks

### system_admin のアカウント侵害
- 被害がインスタンス全体に及ぶ
- **緩和**: system_admin には MFA 必須、`system` scope token は短寿命・使用ごとに発行、長期 token を禁止

### 「自分の task」の定義ブレ
- owner が代わった、もしくは subs から外された人が以前の記憶で「自分の task」と思う
- **緩和**: 「自分の task」 ⇔ `task.owner == self OR self ∈ task.subs` の一点だけで定める。スナップショットの帰属ではなく現在の状態で判定。UI も「あなたはこの task の owner/subs です」を明示

### 複数 admin の互い違いの設定上書き
- A が設定したものを B がその直後上書きしてトラブル
- **緩和**: ADR-0010 の expected_version (optimistic locking) を全 c.* ツールで必須にし、コンフリクトを検出

### MCP クライアントのツールキャッシュ
- クライアントが以前見えていた admin ツールをロール剥奪後も表示し続け、呼んで 403
- **緩和**: 403 のエラーメッセージに「現在のロールと必要なロール」を明記し、LLM が判断できるように

## Revisit when

- 「viewer だけ人を入れたい」要望が定期的に出る → viewer ロール追加の ADR
- 大規模チームで「Org ごとの請求・コストセンター」要件が出る → Org/Workspace 導入の ADR
- コンプライアンス・上場要件で system_admin の処理に人間上位者承認が必要 → escalation フローの ADR
- system_admin を 1 人でも「危険」と見る要件 → 4-eyes 承認・期限付き昇格の導入

## 関連

- ADR-0010 (MCP-first と read/write 分離) — token scope の定義を本 ADR で 4 個に拡張
- ADR-0006 (Storage と Event Log の trait 抽象化) — `MembershipReader` trait を追加予定
- ADR-0008 (Codegen) — MCP manifest の `_meta.yuipath:requiredRole` / `yuipath:ownership` / `yuipath:guards` 出力に適用
- ADR-0012 (ドメインエンティティ確定) — 本 ADR の「Member」「task owner/subs」「Event Log」は ADR-0012 でエンティティとして確定
