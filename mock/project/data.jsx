// Mock data for ProjectWeb — ECサイトリニューアル

const PROJECT = {
  id: "prj-ec-renewal",
  name: "ECサイトリニューアル",
  client: "株式会社サンプル",
  startDate: "2026-04-01",
  endDate: "2026-09-18",
  baselineEnd: "2026-09-11",
  budget: 24800000,
  spent: 10416000,
  ev: 9920000,
  pv: 11160000,
  ac: 10416000,
};

const PROJECT_KPIS = {
  cpi: PROJECT.ev / PROJECT.ac,
  spi: PROJECT.ev / PROJECT.pv,
  progress: 0.42,
  health: "at-risk",
};

const RESOURCES = [
  { id: "r1", name: "田中 美咲",  enName: "Misaki Tanaka",     role: "PM",        color: "#7C5CFA", capacity: 1.0, allocation: 0.85 },
  { id: "r2", name: "佐藤 健",    enName: "Ken Sato",          role: "Tech Lead", color: "#2F6FE0", capacity: 1.0, allocation: 0.95 },
  { id: "r3", name: "鈴木 葵",    enName: "Aoi Suzuki",        role: "Designer",  color: "#E0708A", capacity: 1.0, allocation: 0.55 },
  { id: "r4", name: "山本 翔",    enName: "Sho Yamamoto",      role: "Backend",   color: "#2A8C6E", capacity: 1.0, allocation: 1.15 },
  { id: "r5", name: "中村 玲",    enName: "Rei Nakamura",      role: "Frontend",  color: "#C57F1A", capacity: 1.0, allocation: 0.80 },
  { id: "r6", name: "小林 千夏",  enName: "Chinatsu Kobayashi",role: "QA",        color: "#AC5BC4", capacity: 1.0, allocation: 0.10 },
];

// owner = 主担当 (1名), subs = 副担当
const TASKS = [
  { id: "p1", name: "要件定義", isPhase: true, start: "2026-04-01", end: "2026-04-21", progress: 1.0, depth: 0, status: "done" },
  { id: "t1", name: "ステークホルダーヒアリング",     parent: "p1", start: "2026-04-01", end: "2026-04-07", duration: 5,  progress: 1.0,  owner: "r1", subs: [],          depth: 1, predecessors: [],     critical: true,  status: "done" },
  { id: "t2", name: "業務要件整理",                 parent: "p1", start: "2026-04-06", end: "2026-04-14", duration: 7,  progress: 1.0,  owner: "r1", subs: ["r2"],      depth: 1, predecessors: ["t1"], critical: true,  status: "done" },
  { id: "t3", name: "要件定義書作成・承認",          parent: "p1", start: "2026-04-13", end: "2026-04-21", duration: 7,  progress: 1.0,  owner: "r1", subs: [],          depth: 1, predecessors: ["t2"], critical: true,  status: "done" },

  { id: "p2", name: "設計", isPhase: true, start: "2026-04-20", end: "2026-05-22", progress: 0.85, depth: 0, status: "in-progress" },
  { id: "t4", name: "情報設計・ワイヤーフレーム",    parent: "p2", start: "2026-04-20", end: "2026-04-30", duration: 9,  progress: 1.0,  owner: "r3", subs: [],          depth: 1, predecessors: ["t3"], critical: true,  status: "done" },
  { id: "t5", name: "UIデザイン",                   parent: "p2", start: "2026-04-29", end: "2026-05-15", duration: 13, progress: 0.95, owner: "r3", subs: [],          depth: 1, predecessors: ["t4"], critical: true,  status: "in-progress" },
  { id: "t6", name: "システム設計",                  parent: "p2", start: "2026-04-22", end: "2026-05-08", duration: 13, progress: 1.0,  owner: "r2", subs: ["r4"],      depth: 1, predecessors: ["t3"], critical: false, status: "done" },
  { id: "t7", name: "DB設計",                       parent: "p2", start: "2026-05-04", end: "2026-05-15", duration: 10, progress: 1.0,  owner: "r4", subs: [],          depth: 1, predecessors: ["t6"], critical: false, status: "done" },
  { id: "t8", name: "設計レビュー・承認",            parent: "p2", start: "2026-05-18", end: "2026-05-22", duration: 5,  progress: 0.5,  owner: "r1", subs: ["r2","r3"], depth: 1, predecessors: ["t5","t7"], critical: true, status: "in-progress" },

  { id: "p3", name: "開発", isPhase: true, start: "2026-05-25", end: "2026-08-14", progress: 0.18, depth: 0, status: "in-progress" },
  { id: "t9",  name: "API基盤構築",                  parent: "p3", start: "2026-05-25", end: "2026-06-12", duration: 15, progress: 0.40, owner: "r4", subs: [],          depth: 1, predecessors: ["t8"],  critical: true,  status: "in-progress" },
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
  _tasks = typeof next === "function" ? next(_tasks) : next;
  window.TASKS = _tasks;
  _tasksSubs.forEach(cb => cb());
}
function updateTask(id, patch) {
  setTasks(prev => prev.map(t => t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t));
}
function useTasks() {
  return React.useSyncExternalStore(_tasksSubscribe, _tasksSnapshot);
}

const PROJECTS_LIST = [
  { id: "prj-ec-renewal", name: "ECサイトリニューアル",      client: "株式会社サンプル",   progress: 0.42, health: "at-risk",   members: 6, due: "2026-09-18", current: true },
  { id: "prj-mobile",     name: "モバイルアプリv2.0",        client: "社内 / Mobile Team", progress: 0.78, health: "on-track",  members: 4, due: "2026-07-04" },
  { id: "prj-erp",        name: "ERP移行プロジェクト",        client: "株式会社サンプル",   progress: 0.15, health: "on-track",  members: 8, due: "2027-01-30" },
  { id: "prj-data",       name: "データ基盤構築",             client: "社内 / Data Team",   progress: 0.92, health: "on-track",  members: 3, due: "2026-05-30" },
  { id: "prj-brand",      name: "ブランドリニューアル",       client: "株式会社サンプル",   progress: 0.30, health: "off-track", members: 5, due: "2026-08-15" },
];

const ACTIVITY = [
  { id: "a1", who: "r3", text: "「UIデザイン」の進捗を 95% に更新", time: "2 時間前" },
  { id: "a2", who: "r2", text: "「設計レビュー・承認」にコメントを追加", time: "4 時間前" },
  { id: "a3", who: "r4", text: "「API基盤構築」のベースラインを変更", time: "昨日 18:42" },
  { id: "a4", who: "r1", text: "「要件定義書作成・承認」を完了", time: "昨日 11:20" },
  { id: "a5", who: "r5", text: "「管理画面」を副担当に追加", time: "2 日前" },
];

Object.assign(window, {
  PROJECT, PROJECT_KPIS, RESOURCES, TASKS, PROJECTS_LIST, ACTIVITY, allAssignees,
  useTasks, setTasks, updateTask,
});
