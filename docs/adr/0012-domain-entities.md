# 0012: ドメインエンティティ確定 (mock 由来)

- Status: Proposed
- Date: 2026-05-09
- Refines: ADR-0010, ADR-0011
- Source: `mock/project/data.jsx` および mock 実装全体を「製品 UX 仕様」として扱う

## Context

ADR-0010 / 0011 で MCP-first と権限分離を決めたが、**対象エンティティを「task / project / member / comment / calendar event / resource」と曖昧に列挙していた**。

mock 分析（2026-05-09）で以下が判明:

1. **「Calendar event」という独立エンティティは mock に存在しない**
   - mock の Calendar = **稼働日テンプレート** (曜日ごとの稼働 boolean + 祝日リスト)
   - 「Calendar 画面」は task の start/end を月グリッドに描画しているだけ
   - 会議・ OOO・マイルストーンイベントといった「task と独立した予定」エンティティは一切ない

2. **Resource = Member は同一概念を 2 つの名前で呼んでいた**
   - mock の `RESOURCES` array は team member (人物) そのもの
   - 設備・予算・スキルといった「狭義の resource」は mock にない

3. **Comment は task のみに付く**
   - project / event / inline にはない

4. **Phase / Milestone は Task の flag で表現され、別エンティティではない**
   - `isPhase: bool`、`milestone: bool`

5. **Predecessor は Task の自己参照配列、別エンティティではない**
   - FS (Finish-Start) のみ、SS/FF/SF や lead/lag はやらない

6. **Activity Feed は mock では別 array だが、Event Log と統合可能**

ユーザー要件（2026-05-09）:

- 「AI/LLM 機能は YuiPath 本体に UI を一切持たない。MCP 経由でのみアクセス可能」

## Decision

### 1. 確定エンティティ一覧 (これ以外は作らない)

| Entity | 役割 | mock 由来 |
|---|---|---|
| **User** | ログインアカウント | `auth.jsx` |
| **Project** | プロジェクト | `data.jsx` PROJECTS |
| **Membership** | User × Project の所属関係 (role 付き) | `RESOURCES` + ADR-0011 |
| **Task** | タスク・フェーズ・マイルストーンを統合 | `data.jsx` TASKS |
| **Comment** | Task に対するコメント (plain text) | `data.jsx` COMMENTS |
| **CalendarTemplate** | 稼働日 + 祝日テンプレート | `data.jsx` CALENDARS |
| **Event** | Event Log entry (audit + activity feed source) | mock の ACTIVITY を統合 |

**これ以外のエンティティは現時点で作らない。**

#### User と Membership と Member (Resource) の関係

```
User  (グローバルに 1 人 1 エンティティ)
  ├─ is_system_admin: bool
  ├─ display_name, email, avatar_url, ...
  └─ 複数 Project に membership を持つ

Membership (User × Project の中間テーブル)
  ├─ user_id, project_id
  ├─ role: project_admin | project_member
  ├─ joined_at
  └─ mock で RESOURCES フィールドとして見えた color / capacity / allocation もここに位置づける
     (表示/計算はプロジェクトに閉じるため)
```

「Member」という言葉は UI 上の表現 (= Project に参加している User を Membership とともに表示したもの)。コードでは Membership entity として表す。

### 2. Task は統合型 (kind 列を作らず flag で表現)

```rust
struct Task {
  id: TaskId,
  project_id: ProjectId,
  name: String,
  description: Option<String>,
  parent: Option<TaskId>,         // phase への参照
  is_phase: bool,                 // true なら他 field はせいぜい集計ベース
  start: Date,
  end: Date,
  duration: u32,                  // 稼働日、CalendarTemplate を使って計算
  status: TaskStatus,
  progress: Option<f32>,          // 0.0–1.0、leaf は status からマップ
  owner: Option<UserId>,          // 主担当
  subs: Vec<UserId>,              // 副担当
  predecessors: Vec<TaskId>,      // FS 依存のみ
  critical: bool,                 // CP indicator (計算結果をキャッシュ)
  milestone: bool,                // マイルストーン表示 flag
  depth: u32,                     // visual hierarchy (phases=0, leaves≥1)
  created_at, updated_at, ...
}

enum TaskStatus {
  Todo, Started, InProgress50, InProgress80, Review, Done, Blocked,
}
```

- Phase も Milestone も Task として保持、flag で区別
- 会議も「Task (短期間 + assignee)」として表現
- TaskStatus は法定遷移ルールなし (任意遷移)。必要になったら別 ADR で追加
- Predecessor は Task の自己参照配列、別エンティティを作らない

### 3. CalendarTemplate は稼働日テンプレートだけ

```rust
struct CalendarTemplate {
  id: CalendarId,
  name: String,                       // "標準" "24h" "金融カレンダー" など
  working_days: [bool; 7],            // [Sun, Mon, ..., Sat]
  holidays: Vec<Holiday>,             // 特定日付の非稼働日
  scope: CalendarScope,               // global | project_specific
}

struct Holiday { date: Date, name: String }
```

- 「会議」「OOO」「マイルストーンイベント」のような独立予定 entity は作らない
- マイルストーン → Task の `milestone: true`
- 会議 → Task で表現 (短期間 + 出席者を owner/subs)
- OOO → 現時点不サポート、必要になったら別 ADR

### 4. Event Log と Activity Feed を統合

**別 store を作らない。「Activity Feed = Event Log の人間向け view」とする。**

```rust
struct Event {
  id: EventId,
  ts: DateTime<Utc>,
  actor: UserId,                  // 誰が
  project_id: ProjectId,          // どの project で
  kind: EventKind,                // 何をしたか
  target: Option<EventTarget>,    // 対象エンティティ (TaskId / CommentId / etc)
  payload: EventPayload,          // before/after の diff
}

enum EventKind {
  TaskCreated, TaskUpdated, TaskDeleted,
  CommentCreated, CommentDeleted,
  ProjectCreated, ProjectUpdated, ProjectDeleted,
  MemberAdded, MemberRemoved, MemberRoleChanged,
  CalendarTemplateCreated, CalendarTemplateUpdated, CalendarTemplateDeleted,
  // 参照 (system_admin の読みアクセス audit)
  SensitiveRead,
}
```

Activity Feed は `q.events.list?project_id=X&since=Y` で正規取得、UI 側で EventKind ごとに人間語に render:

```
TaskUpdated(payload: { field: "status", from: "todo", to: "in-progress-50" })
  → "田中さんが 「詳細設計」を 進行中 (50%) に変更"
```

メリット:
- mock の ACTIVITY と COMMENTS を両方含めた「」一本でよく」
- 二重保管・同期バグゼロ
- ADR-0002 の DynamoDB single-table 設計と整合

「表示性能」の論点は必要になったら read model (CQRS) を ADR で追記。現時点では不要と判断。

### 5. AI/LLM 機能は本体に UI を持たない (重要)

**YuiPath 本体は AI 不在でも完全に成立する PM ツールとして設計される。**

- アプリ内に「AI ボタン」「AI 提案パネル」「チャット画面」を設けない
- AI を使いたいユーザーは **外部 MCP クライアント** (Claude Desktop / Claude Code / Cursor 他) を使う
- 「WBS を生成して」のような依頼は Claude Desktop 上で行い、LLM が yuipath の MCP server を逆引く:
  ```
  ユーザー → Claude Desktop
             ↓  (LLM 推論)
        yuipath MCP server の q.* / c.* を連携
             ↓
        YuiPath のデータが更新される
  ```
- yuipath-mcp (Python、ADR-0009) はこのフローを支援する Strands Agent。pm-mcp (Rust) の上に LLM 推論を被せた合成 MCP サーバー

### 6. mock 由来の「やらないこと」を明文化

以下は当面実装しない (CLAUDE.md / mock/README の方針に追従):

| 領域 | やらないもの |
|---|---|
| Calendar/Event | 独立 event entity、繰り返しイベント、出欠・招待 |
| Task | 繰り返し task、Tag/Label/Priority、subtask 階層 (phase 以外)、複数 owner |
| Comment | task 以外への comment、rich text、mention、reaction、添付 |
| File | 添付ファイル全般 |
| 共有 | 外部公開リンク、ゲスト招待 |
| UI | モバイル / レスポンシブレイアウト |
| 通知 | メール / push 通知、通知設定 |
| AI | 本体内 AI UI (上記 5 と重複) |
| 互換 | MS Project (MPP) 互換、オフライン同期 |

これらが必要になった時点で個別 ADR で追加。

## Consequences

### Accepted (positive)

- ADR-0010 の operation map が **7 エンティティ × CRUD** で機械的に展開できる (見通しが効く)
- Activity Feed 独立 store が消え、Event Log 1 つに集約 → 二重実装ゼロ
- AI 機能を本体から切り離すことで、本体は「純粋な CRUD + MCP」として単純化
- mock の設計意図と実装方針が一致、仕様とコードのズレが上がりにくい
- Task を flag で表現するため、Phase や Milestone の導入/削除でスキーマ変更不要

### Accepted (negative)

- 「会議」「OOO」を task で表現するため、出欠管理やカレンダー双方向連携は不可
- AI 機能の利用に MCP クライアントが必須。一般エンドユーザー向け SaaS としては敷居高め → ドキュメントとオンボーディングで許容
- yuipath-mcp と pm-mcp の役割境界が「AI 推論あり/なし」になり、推論なし (単純な MCP 操作) の構成も成立する
- TaskStatus 遷移ルール不在 → 不整合な遷移 (done → todo など) が起き得る
  → UI で顔とダイアログで抑制、必要であれば後付け

## Risks

### Event payload の format 進化
- kind ごとに payload schema が違う → migration が辛い
- **緩和**: schemars で版付け、過去 event も読める forward compat 設計。payload は tagged enum で schema 明示

### 「会議も task」の認識ズレ
- 利用者が「Task = 作業」と狭く解釈すると会議入力が阮害される
- **緩和**: ドキュメントに明記、UI 上 task kind を増やす可能性は将来再考

### AI なしの UX が物足りない
- 「YuiPath 単体だと普通の PM ツール」に見える
- **緩和**: ブランディングで「AI 連携は MCP クライアントから」を強調。Claude Desktop / Claude Code を推奨クライアントとしての onboarding を用意

### Membership に color/capacity/allocation が位置づく関係
- Pattern A (ローカル 1 人) でも Membership テーブルが必須になる
- **緩和**: Pattern A ではユーザー作成時にデフォルト Membership (color: 乱数 / capacity: 1.0 / allocation: 1.0) を自動生成

## Revisit when

- 利用者から calendar event / 会議出欠管理の要望が複数回上がる → CalendarEvent entity 追加 ADR
- AI 機能を MCP なしで使いたい層 (technical でない user) が target になる → 本体 UI に AI ボタン追加 ADR
- Tag / Priority の不在で運用が回らないケース → Task field 追加 ADR
- Activity Feed の query 性能が問題化 → 別 read model (CQRS) ADR
- TaskStatus 遷移ルール不在が事故を生む → 遷移表を ADR で定める

## 関連

- ADR-0002 (Event Log on DynamoDB) — Event entity の永続化先、Activity Feed もここから読む
- ADR-0003 (AI via external MCP) — 「本体に AI UI なし」を本 ADR で明誌
- ADR-0008 (Codegen) — 本 ADR のエンティティ 7 つを source に operations / schema / openapi / mcp manifest を生成
- ADR-0009 (Strands → AgentCore) — yuipath-mcp は pm-mcp の上に LLM を被せる、本体とは独立した追加サーバー
- ADR-0010 (MCP-first) — operation map は本 ADR の 7 エンティティ × CRUD で展開
- ADR-0011 (Roles and permissions) — 「Member = Resource」「自分の task = owner OR subs」を本 ADR でエンティティとして確定
- mock/project/data.jsx — エンティティ定義の正典
