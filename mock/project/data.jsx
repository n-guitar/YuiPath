// Mock data for ProjectWeb — ECサイトリニューアル

// Pinned "today" for the demo. Used by detectors and any UI showing
// time-relative data (overdue, upcoming milestones, etc.).
const TODAY = "2026-06-12";
const NOW   = "2026-06-12T15:30:00";  // full timestamp for relative-time display

// Currently logged-in user (mock). In production this comes from auth.
const CURRENT_USER_ID = "r1";

// Single source of truth for projects. Each entry is a full project object
// (the previously-separate PROJECT and PROJECTS_LIST have been merged).
// The "current" project is the one with `current: true` — there must be
// exactly one at any time.
const PROJECTS = [
  {
    id: "prj-ec-renewal",
    name: "ECサイトリニューアル",
    client: "株式会社サンプル",
    description: "既存ECサイトの全面リニューアル。決済基盤刷新と管理画面の再構築を含む。",
    startDate: "2026-04-01",
    endDate: "2026-09-18",
    baselineEnd: "2026-09-11",
    progress: 0.42,
    health: "at-risk",
    members: 6,
    current: true,
    // 祝日（プロジェクト固有）。今は表示のみ。営業日計算への反映は次フェーズ。
    holidays: [
      { date: "2026-04-29", name: "昭和の日" },
      { date: "2026-05-03", name: "憲法記念日" },
      { date: "2026-05-04", name: "みどりの日" },
      { date: "2026-05-05", name: "こどもの日" },
      { date: "2026-05-06", name: "振替休日" },
      { date: "2026-07-20", name: "海の日" },
      { date: "2026-08-11", name: "山の日" },
      { date: "2026-09-21", name: "敬老の日" },
      { date: "2026-09-22", name: "国民の休日" },
      { date: "2026-09-23", name: "秋分の日" },
    ],
  },
  {
    id: "prj-mobile",
    name: "モバイルアプリv2.0",
    client: "社内 / Mobile Team",
    description: "iOS/Android アプリの v2 リリース。UI 刷新と Push 通知対応。",
    startDate: "2026-03-01",
    endDate: "2026-07-04",
    baselineEnd: "2026-07-04",
    progress: 0.78,
    health: "on-track",
    members: 4,
  },
  {
    id: "prj-erp",
    name: "ERP移行プロジェクト",
    client: "株式会社サンプル",
    description: "オンプレミス ERP からクラウド ERP への段階移行。",
    startDate: "2026-04-15",
    endDate: "2027-01-30",
    baselineEnd: "2027-01-30",
    progress: 0.15,
    health: "on-track",
    members: 8,
  },
  {
    id: "prj-data",
    name: "データ基盤構築",
    client: "社内 / Data Team",
    description: "全社データウェアハウス構築と BI ツール導入。",
    startDate: "2026-01-10",
    endDate: "2026-05-30",
    baselineEnd: "2026-05-30",
    progress: 0.92,
    health: "on-track",
    members: 3,
  },
  {
    id: "prj-brand",
    name: "ブランドリニューアル",
    client: "株式会社サンプル",
    description: "コーポレートブランドの再定義とビジュアル一新。",
    startDate: "2026-02-01",
    endDate: "2026-08-15",
    baselineEnd: "2026-07-31",
    progress: 0.30,
    health: "off-track",
    members: 5,
  },
];

// Backward-compat alias: `PROJECT` is a Proxy that always reads from the
// currently-active project. Existing code referencing `PROJECT.startDate`
// keeps working without touching every callsite.
const PROJECT = new Proxy({}, {
  get(_, key) {
    const cur = (window.PROJECTS || PROJECTS).find(p => p.current) || (window.PROJECTS || PROJECTS)[0];
    return cur ? cur[key] : undefined;
  },
  has(_, key) {
    const cur = (window.PROJECTS || PROJECTS).find(p => p.current);
    return cur ? (key in cur) : false;
  },
});

const PROJECT_KPIS = new Proxy({}, {
  get(_, key) {
    const cur = (window.PROJECTS || PROJECTS).find(p => p.current);
    if (!cur) return undefined;
    if (key === "progress") return cur.progress;
    if (key === "health")   return cur.health;
    return undefined;
  },
});

const RESOURCES = [
  { id: "r1", name: "田中 美咲",  enName: "Misaki Tanaka",     role: "PM",        color: "#7C5CFA", capacity: 1.0, allocation: 0.85 },
  { id: "r2", name: "佐藤 健",    enName: "Ken Sato",          role: "Tech Lead", color: "#2F6FE0", capacity: 1.0, allocation: 0.95 },
  { id: "r3", name: "鈴木 葵",    enName: "Aoi Suzuki",        role: "Designer",  color: "#E0708A", capacity: 1.0, allocation: 0.55 },
  { id: "r4", name: "山本 翔",    enName: "Sho Yamamoto",      role: "Backend",   color: "#2A8C6E", capacity: 1.0, allocation: 1.15 },
  { id: "r5", name: "中村 玲",    enName: "Rei Nakamura",      role: "Frontend",  color: "#C57F1A", capacity: 1.0, allocation: 0.80 },
  { id: "r6", name: "小林 千夏",  enName: "Chinatsu Kobayashi",role: "QA",        color: "#AC5BC4", capacity: 1.0, allocation: 0.10 },
];

// Status taxonomy — 7 ordered states. blocked is orthogonal (any-time) but
// kept in the same list for the picker. Progress is derived from status for
// leaf tasks; phases compute progress from their leaves.
const STATUSES = [
  { value: "todo",            label: "未着手",       short: "未着手",      color: "var(--text-tertiary)", progress: 0.0 },
  { value: "started",         label: "着手",         short: "着手",        color: "#7C5CFA",              progress: 0.15 },
  { value: "in-progress-50",  label: "進行中(50%)",  short: "進行中 50",   color: "var(--accent)",        progress: 0.5 },
  { value: "in-progress-80",  label: "進行中(80%)",  short: "進行中 80",   color: "var(--accent)",        progress: 0.8 },
  { value: "review",          label: "レビュー中",   short: "レビュー中",  color: "var(--warn)",          progress: 0.9 },
  { value: "done",            label: "完了",         short: "完了",        color: "var(--success)",       progress: 1.0 },
  { value: "blocked",         label: "停滞",         short: "停滞",        color: "var(--critical)",      progress: null },
];
const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map(s => [s.value, s]));
// Legacy alias: existing data may still carry "in-progress"; map it to a sane bucket.
STATUS_BY_VALUE["in-progress"] = STATUS_BY_VALUE["in-progress-50"];

// owner = 主担当 (1名), subs = 副担当
const TASKS = [
  { id: "p1", name: "要件定義", isPhase: true, start: "2026-04-01", end: "2026-04-21", progress: 1.0, depth: 0, status: "done", description: "プロジェクト全体のスコープ・要件をステークホルダーと合意するフェーズ。" },
  { id: "t1", name: "ステークホルダーヒアリング",     parent: "p1", start: "2026-04-01", end: "2026-04-07", duration: 5,  progress: 1.0,  owner: "r1", subs: [],          depth: 1, predecessors: [],     critical: true,  status: "done",            description: "事業部長・営業・カスタマーサポート各代表からヒアリング。録音と議事録は共有Drive。" },
  { id: "t2", name: "業務要件整理",                 parent: "p1", start: "2026-04-06", end: "2026-04-14", duration: 7,  progress: 1.0,  owner: "r1", subs: ["r2"],      depth: 1, predecessors: ["t1"], critical: true,  status: "done",            description: "ヒアリング結果から業務フロー図とユースケース一覧を作成。" },
  { id: "t3", name: "要件定義書作成・承認",          parent: "p1", start: "2026-04-13", end: "2026-04-21", duration: 7,  progress: 1.0,  owner: "r1", subs: [],          depth: 1, predecessors: ["t2"], critical: true,  status: "done",            description: "要件定義書 v1.0 を作成し、経営会議で承認を取得。" },

  { id: "p2", name: "設計", isPhase: true, start: "2026-04-20", end: "2026-05-22", progress: 0.85, depth: 0, status: "in-progress-80", description: "情報設計・UIデザイン・システム設計を並行で進める。" },
  { id: "t4", name: "情報設計・ワイヤーフレーム",    parent: "p2", start: "2026-04-20", end: "2026-04-30", duration: 9,  progress: 1.0,  owner: "r3", subs: [],          depth: 1, predecessors: ["t3"], critical: true,  status: "done",            description: "サイトマップとワイヤーをFigmaで作成。レビュー済み。" },
  { id: "t5", name: "UIデザイン",                   parent: "p2", start: "2026-04-29", end: "2026-05-15", duration: 13, progress: 0.95, owner: "r3", subs: [],          depth: 1, predecessors: ["t4"], critical: true,  status: "review",          description: "主要画面（TOP・一覧・詳細・カート・決済）のビジュアルデザイン。最終レビュー待ち。" },
  { id: "t6", name: "システム設計",                  parent: "p2", start: "2026-04-22", end: "2026-05-08", duration: 13, progress: 1.0,  owner: "r2", subs: ["r4"],      depth: 1, predecessors: ["t3"], critical: false, status: "done",            description: "アーキテクチャ図・API一覧・非機能要件を整理。" },
  { id: "t7", name: "DB設計",                       parent: "p2", start: "2026-05-04", end: "2026-05-15", duration: 10, progress: 1.0,  owner: "r4", subs: [],          depth: 1, predecessors: ["t6"], critical: false, status: "done",            description: "ER図・テーブル定義書・マイグレーション方針。" },
  { id: "t8", name: "設計レビュー・承認",            parent: "p2", start: "2026-05-18", end: "2026-05-22", duration: 5,  progress: 0.5,  owner: "r1", subs: ["r2","r3"], depth: 1, predecessors: ["t5","t7"], critical: true, status: "in-progress-50",   description: "全設計成果物の最終レビュー会議を実施。" },

  { id: "p3", name: "開発", isPhase: true, start: "2026-05-25", end: "2026-08-14", progress: 0.18, depth: 0, status: "started", description: "API・フロント・管理画面を順次実装。" },
  { id: "t9",  name: "API基盤構築",                  parent: "p3", start: "2026-05-25", end: "2026-06-12", duration: 15, progress: 0.40, owner: "r4", subs: [],          depth: 1, predecessors: ["t8"],  critical: true,  status: "started",          description: "Express + Prisma の雛形構築、認証ミドルウェア、ロギング基盤。" },
  { id: "t10", name: "認証・権限機能",                parent: "p3", start: "2026-06-08", end: "2026-06-26", duration: 15, progress: 0.0,  owner: "r4", subs: [],          depth: 1, predecessors: ["t9"],  critical: false, status: "todo" },
  { id: "t11", name: "商品カタログ機能",              parent: "p3", start: "2026-06-15", end: "2026-07-10", duration: 20, progress: 0.0,  owner: "r4", subs: ["r5"],      depth: 1, predecessors: ["t9"],  critical: true,  status: "todo" },
  { id: "t12", name: "カート・決済機能",              parent: "p3", start: "2026-07-06", end: "2026-07-31", duration: 20, progress: 0.0,  owner: "r4", subs: ["r5"],      depth: 1, predecessors: ["t11"], critical: true,  status: "todo" },
  { id: "t13", name: "管理画面",                     parent: "p3", start: "2026-06-29", end: "2026-08-07", duration: 30, progress: 0.0,  owner: "r5", subs: [],          depth: 1, predecessors: ["t10"], critical: false, status: "todo" },
  { id: "t14", name: "フロント統合",                 parent: "p3", start: "2026-08-03", end: "2026-08-14", duration: 10, progress: 0.0,  owner: "r5", subs: ["r3"],      depth: 1, predecessors: ["t12","t13"], critical: true, status: "todo" },

  { id: "p4", name: "テスト・リリース", isPhase: true, start: "2026-08-17", end: "2026-09-18", progress: 0, depth: 0, status: "todo" },
  { id: "t15", name: "結合テスト",                   parent: "p4", start: "2026-08-17", end: "2026-08-28", duration: 10, progress: 0,    owner: "r6", subs: ["r2"],      depth: 1, predecessors: ["t14"], critical: true,  status: "todo" },
  { id: "t16", name: "受入テスト",                   parent: "p4", start: "2026-08-31", end: "2026-09-11", duration: 10, progress: 0,    owner: "r6", subs: ["r1"],      depth: 1, predecessors: ["t15"], critical: true,  status: "todo" },
  { id: "t17", name: "本番リリース",                 parent: "p4", start: "2026-09-14", end: "2026-09-18", duration: 5,  progress: 0,    owner: "r2", subs: ["r4"],      depth: 1, predecessors: ["t16"], critical: true,  status: "todo", milestone: true },
];

// Helper: all involved (owner first, then subs)
const allAssignees = (t) => [t.owner, ...(t.subs || [])].filter(Boolean);

// ─────────── Tasks store (subscribable, mutable) ───────────
// Live tasks array that table & gantt both edit. Subscribers re-render via useSyncExternalStore.
let _tasks = TASKS;
const _tasksSubs = new Set();
const _tasksSubscribe = (cb) => { _tasksSubs.add(cb); return () => _tasksSubs.delete(cb); };
const _tasksSnapshot = () => _tasks;
function setTasks(next) {
  const arr = typeof next === "function" ? next(_tasks) : next;
  // _tasks gets a fresh reference per update so useSyncExternalStore detects
  // the change. We ALSO mirror the contents into the original `TASKS` const
  // (in-place) so modules that captured the bare reference (e.g. sidebar,
  // primitives.jsx avatar lookups) read the latest data.
  _tasks = arr;
  TASKS.length = 0;
  TASKS.push(...arr);
  window.TASKS = _tasks;
  _tasksSubs.forEach(cb => cb());
}
function updateTask(id, patch) {
  setTasks(prev => prev.map(t => t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t));
}
function useTasks() {
  return React.useSyncExternalStore(_tasksSubscribe, _tasksSnapshot);
}

// ─────────── Resources store (same pattern as tasks) ───────────
let _resources = RESOURCES;
const _resourcesSubs = new Set();
const _resourcesSubscribe = (cb) => { _resourcesSubs.add(cb); return () => _resourcesSubs.delete(cb); };
const _resourcesSnapshot = () => _resources;
function setResources(next) {
  const arr = typeof next === "function" ? next(_resources) : next;
  _resources = arr;
  RESOURCES.length = 0;
  RESOURCES.push(...arr);
  window.RESOURCES = _resources;
  _resourcesSubs.forEach(cb => cb());
}
function updateResource(id, patch) {
  setResources(prev => prev.map(r => r.id === id ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r));
}
function useResources() {
  return React.useSyncExternalStore(_resourcesSubscribe, _resourcesSnapshot);
}

// Palette for new-resource avatar colors
const RESOURCE_COLORS = ["#7C5CFA", "#2F6FE0", "#E0708A", "#2A8C6E", "#C57F1A", "#AC5BC4", "#DC4C3F", "#1F1F1E"];

// ─────────── Projects store (same pattern as tasks/resources) ───────────
let _projects = PROJECTS;
const _projectsSubs = new Set();
const _projectsSubscribe = (cb) => { _projectsSubs.add(cb); return () => _projectsSubs.delete(cb); };
const _projectsSnapshot = () => _projects;
function setProjects(next) {
  const arr = typeof next === "function" ? next(_projects) : next;
  _projects = arr;
  PROJECTS.length = 0;
  PROJECTS.push(...arr);
  window.PROJECTS = _projects;
  _projectsSubs.forEach(cb => cb());
}
function updateProject(id, patch) {
  setProjects(prev => prev.map(p => p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p));
}
function useProjects() {
  return React.useSyncExternalStore(_projectsSubscribe, _projectsSnapshot);
}
function switchToProject(id) {
  setProjects(prev => prev.map(p => ({ ...p, current: p.id === id })));
}
function deleteProject(id) {
  setProjects(prev => {
    const remaining = prev.filter(p => p.id !== id);
    // If we deleted the current project, promote the first remaining one.
    if (!remaining.some(p => p.current) && remaining.length > 0) {
      remaining[0] = { ...remaining[0], current: true };
    }
    return remaining;
  });
}

// Comments per task. Flat list (no threaded replies in this mock).
const COMMENTS = [
  { id: "c1", taskId: "t8", authorId: "r2", body: "DB設計レビュー結果を反映済みです。残るのはUIの最終確認のみ。", createdAt: "2026-06-12T11:20:00" },
  { id: "c2", taskId: "t8", authorId: "r1", body: "了解です。明日の朝会で最終承認しましょう。", createdAt: "2026-06-12T11:35:00" },
  { id: "c3", taskId: "t8", authorId: "r3", body: "UIの修正は今日中に上げられます。", createdAt: "2026-06-12T13:08:00" },
  { id: "c4", taskId: "t5", authorId: "r3", body: "ヒーロー画像のサイズ感、もう一段大きい方が良さそうです。検討中。", createdAt: "2026-06-11T16:42:00" },
  { id: "c5", taskId: "t9", authorId: "r2", body: "認証ミドルウェアの方針、相談したいので時間ください。", createdAt: "2026-06-10T14:00:00" },
];

// ─────────── Comments store (subscribable, mutable) ───────────
let _comments = COMMENTS;
const _commentsSubs = new Set();
const _commentsSubscribe = (cb) => { _commentsSubs.add(cb); return () => _commentsSubs.delete(cb); };
const _commentsSnapshot = () => _comments;
function setComments(next) {
  const arr = typeof next === "function" ? next(_comments) : next;
  _comments = arr;
  COMMENTS.length = 0;
  COMMENTS.push(...arr);
  window.COMMENTS = _comments;
  _commentsSubs.forEach(cb => cb());
}
function addComment(taskId, body, authorId = CURRENT_USER_ID) {
  const id = "c" + Math.random().toString(36).slice(2, 8);
  const createdAt = new Date().toISOString().slice(0, 19);
  setComments(prev => [...prev, { id, taskId, authorId, body, createdAt }]);
  return id;
}
function updateComment(id, body) {
  setComments(prev => prev.map(c => c.id === id ? { ...c, body, editedAt: new Date().toISOString().slice(0, 19) } : c));
}
function deleteComment(id) {
  setComments(prev => prev.filter(c => c.id !== id));
}
function useComments() {
  return React.useSyncExternalStore(_commentsSubscribe, _commentsSnapshot);
}

// Activity feed. `taskId` lets the dashboard make each entry navigable; `kind`
// (optional) lets the drawer auto-scroll to a relevant section (e.g. comments).
// `commentId` lets a "comment_added" entry land on the specific comment.
const ACTIVITY = [
  { id: "a1", who: "r3", taskId: "t5",  kind: "progress", text: "「UIデザイン」の進捗を 95% に更新",       time: "2 時間前" },
  { id: "a2", who: "r3", taskId: "t8",  kind: "comment",  commentId: "c3", text: "「設計レビュー・承認」にコメントを追加", time: "4 時間前" },
  { id: "a3", who: "r4", taskId: "t9",  kind: "schedule", text: "「API基盤構築」のベースラインを変更",   time: "昨日 18:42" },
  { id: "a4", who: "r1", taskId: "t3",  kind: "status",   text: "「要件定義書作成・承認」を完了",         time: "昨日 11:20" },
  { id: "a5", who: "r5", taskId: "t13", kind: "assign",   text: "「管理画面」を副担当に追加",             time: "2 日前" },
];

// ─────────── CSV import / export ───────────
// Schema (one row per task / phase). Array fields use ";" as a separator
// inside the cell. Booleans serialize as "true" / "false".
const CSV_COLS = [
  "id", "name", "parent", "isPhase",
  "start", "end", "duration", "status", "progress",
  "owner", "subs", "predecessors",
  "critical", "milestone", "depth", "description",
];

function _csvField(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function tasksToCsv(tasks) {
  const lines = [CSV_COLS.join(",")];
  tasks.forEach(t => {
    const row = CSV_COLS.map(c => {
      const v = t[c];
      if (Array.isArray(v)) return _csvField(v.join(";"));
      if (typeof v === "boolean") return v ? "true" : "false";
      return _csvField(v);
    });
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

// Tiny CSV parser: handles quoted fields with embedded commas/newlines/quotes.
function _parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = "";
      }
      else if (c === '"' && field === "") inQuotes = true;
      else field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function csvToTasks(text) {
  const rows = _parseCsv(text).filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
  if (rows.length === 0) return { tasks: [], errors: ["空のファイルです"] };
  const headers = rows[0];
  const errors = [];
  CSV_COLS.forEach(c => {
    if (!headers.includes(c) && ["id", "name"].includes(c)) {
      errors.push(`必須列が見つかりません: ${c}`);
    }
  });
  if (errors.length > 0) return { tasks: [], errors };
  const tasks = rows.slice(1).map((r, ri) => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = r[i] ?? "";
      if (h === "isPhase" || h === "critical" || h === "milestone") obj[h] = v === "true";
      else if (h === "duration" || h === "depth") obj[h] = v ? parseInt(v, 10) || 0 : 0;
      else if (h === "progress") obj[h] = v ? parseFloat(v) || 0 : 0;
      else if (h === "subs" || h === "predecessors") obj[h] = v ? v.split(";").filter(Boolean) : [];
      else if (h === "owner") obj[h] = v || undefined;
      else obj[h] = v;
    });
    if (!obj.id) errors.push(`行 ${ri + 2}: id が空です`);
    if (!obj.depth && !obj.isPhase) obj.depth = 1;
    return obj;
  });
  return { tasks, errors };
}

function downloadCsv(filename, text) {
  // BOM helps Excel auto-detect UTF-8
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Initial mirror so the PROJECT/PROJECTS_KPIS Proxies can find the array.
window.PROJECTS = PROJECTS;

Object.assign(window, {
  PROJECT, PROJECT_KPIS, RESOURCES, TASKS, PROJECTS, ACTIVITY, COMMENTS, TODAY, NOW, CURRENT_USER_ID, allAssignees,
  useTasks, setTasks, updateTask,
  useResources, setResources, updateResource, RESOURCE_COLORS,
  useProjects, setProjects, updateProject, switchToProject, deleteProject,
  useComments, setComments, addComment, updateComment, deleteComment,
  STATUSES, STATUS_BY_VALUE,
  tasksToCsv, csvToTasks, downloadCsv, CSV_COLS,
});
