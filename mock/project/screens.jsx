// Dashboard, Resources, Task detail drawer

// ─────────── Risk detectors ───────────
// Each detector is a pure function: (ctx) => Array<{ id, severity, ... }>.
// `severity` is "high" | "medium" | "low". To add a new signal, write a
// detector and append it to the DETECTORS array — no other code changes
// needed for the dashboard to surface it.
const TODAY_DATE = () => parseDate(TODAY);
const isPastISO = (iso) => parseDate(iso) < TODAY_DATE();
const isFutureISO = (iso) => parseDate(iso) >= TODAY_DATE();

function detectBlocked(ctx) {
  return ctx.tasks
    .filter(t => !t.isPhase && t.status === "blocked")
    .map(t => ({
      id: `blocked-${t.id}`, severity: t.critical ? "high" : "medium",
      kind: "task", task: t,
      headline: t.name,
      reason: t.critical ? "停滞 (CP上)" : "停滞中",
    }));
}

function detectOverdue(ctx) {
  return ctx.tasks
    .filter(t => !t.isPhase && (t.progress || 0) < 1.0 && isPastISO(t.end))
    .map(t => ({
      id: `overdue-${t.id}`, severity: "high",
      kind: "task", task: t,
      headline: t.name,
      reason: `期限 ${fmtJP(t.end)} を超過`,
    }));
}

function detectTodoLate(ctx) {
  return ctx.tasks
    .filter(t => !t.isPhase && t.status === "todo" && isPastISO(t.start))
    .map(t => ({
      id: `late-${t.id}`, severity: "medium",
      kind: "task", task: t,
      headline: t.name,
      reason: `${fmtJP(t.start)} 開始予定なのに未着手`,
    }));
}

function detectOverloadCascade(ctx) {
  // Overload only matters if it persists / has work scheduled afterward.
  // A one-week spike with empty calendar after = self-resolving, ignore.
  const out = [];
  ctx.resources.forEach(r => {
    const loads = ctx.weekLoads[r.id] || [];
    const peakIdx = loads.findIndex(v => v > 1.0);
    if (peakIdx === -1) return;
    const hasFuture = loads.slice(peakIdx + 1).some(v => v > 0);
    if (!hasFuture) return;
    const peak = Math.max(...loads);
    out.push({
      id: `overload-${r.id}`,
      severity: peak > 1.3 ? "high" : "medium",
      kind: "resource", resource: r,
      headline: r.name,
      reason: `ピーク ${Math.round(peak*100)}% · 後続タスクあり`,
    });
  });
  return out;
}

const DETECTORS_NOW = [
  { key: "blocked",          label: "停滞中",          icon: "bolt",     detect: detectBlocked },
  { key: "overdue",          label: "期限超過",        icon: "calendar", detect: detectOverdue },
  { key: "todo-late",        label: "着手遅れ",        icon: "calendar", detect: detectTodoLate },
  { key: "overload-cascade", label: "過負荷+後続あり", icon: "users",    detect: detectOverloadCascade },
];

// Milestone risk evaluator (separate from "now" detectors — milestones are
// forward-looking).
function evaluateMilestones(ctx) {
  const taskById = Object.fromEntries(ctx.tasks.map(t => [t.id, t]));
  const isRiskyPred = (t) =>
    t.status === "blocked" ||
    (t.status === "todo" && isPastISO(t.start)) ||
    (isPastISO(t.end) && (t.progress || 0) < 1.0);

  return ctx.tasks
    .filter(t => t.milestone)
    .sort((a,b) => (a.end < b.end ? -1 : 1))
    .map(m => {
      const preds = (m.predecessors || []).map(id => taskById[id]).filter(Boolean);
      const risky = preds.filter(isRiskyPred);
      // Also walk one level deeper to find indirect risk
      const deepRisky = [];
      preds.forEach(p => (p.predecessors || []).forEach(pid => {
        const pp = taskById[pid];
        if (pp && isRiskyPred(pp)) deepRisky.push(pp);
      }));
      const status = risky.length > 0 ? "risk" : (deepRisky.length > 0 ? "watch" : "ok");
      return { milestone: m, riskyPreds: risky, deepRisky, status };
    });
}

// ─────────── Dashboard ───────────
function DashboardScreen({ onOpenTask, onOpenResource, onCreateTask, onGoView }) {
  useTasks();
  useResources();

  const tasks = window.TASKS || [];
  const resources = window.RESOURCES || [];

  // Onboarding hero — no tasks means there's nothing for the detectors to
  // chew on, so the regular dashboard would render mostly-empty cards with
  // stale activity. Replace it with a focused first-run experience.
  if (tasks.length === 0) {
    return (
      <div className="pw-dash pw-dash--onboarding">
        <div className="pw-onboard">
          <YuiPathMark size={96} animated/>
          <h2 className="pw-onboard__title">プロジェクトを始めましょう</h2>
          <p className="pw-onboard__lead">
            タスクを並べて、日程を組んで、進捗を可視化する。シンプルなプロジェクト管理ツール。
          </p>
          <ol className="pw-onboard__steps">
            <li>
              <span className="pw-onboard__step-num">1</span>
              <div>
                <strong>タスクを追加</strong>
                <span>テーブル画面で直接入力、または CSV から取り込み</span>
              </div>
            </li>
            <li>
              <span className="pw-onboard__step-num">2</span>
              <div>
                <strong>日程を組む</strong>
                <span>ガントで開始日・期間・依存関係を可視化</span>
              </div>
            </li>
            <li>
              <span className="pw-onboard__step-num">3</span>
              <div>
                <strong>状況を把握する</strong>
                <span>このダッシュボードで「要注意」シグナルを自動検出</span>
              </div>
            </li>
          </ol>
          <div className="pw-onboard__cta-row">
            <button className="pw-btn pw-btn--primary" onClick={onCreateTask}>
              <Icon name="plus" size={14}/> 最初のタスクを追加
            </button>
            <button className="pw-btn pw-btn--ghost" onClick={() => onGoView?.("table")}>
              <Icon name="table" size={14}/> テーブル画面を開く
            </button>
          </div>
        </div>
      </div>
    );
  }

  const weekLoads = computeWeeklyLoad(24, PROJECT.startDate);
  const ctx = { tasks, resources, weekLoads };

  // Run all "now" detectors
  const nowResults = DETECTORS_NOW.map(d => ({ ...d, items: d.detect(ctx) }))
    .filter(g => g.items.length > 0);
  const totalAttention = nowResults.reduce((s, g) => s + g.items.length, 0);

  const milestones = evaluateMilestones(ctx);

  // Days remaining in project
  const daysRemaining = Math.max(0, Math.round((parseDate(PROJECT.endDate) - TODAY_DATE()) / MS_DAY));

  // Schedule health from REAL data (no fake EVM): how many tasks are
  // currently behind. Combines overdue + todo-late detector groups.
  const lateTaskCount = nowResults
    .filter(g => g.key === "overdue" || g.key === "todo-late")
    .reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="pw-dash">
      <HealthBar
        daysRemaining={daysRemaining}
        lateTaskCount={lateTaskCount}
        attentionCount={totalAttention}/>

      {/* 2x2 grid: attention/risk on top, phases/activity below */}
      <div className="pw-dash__grid">
        <AttentionPanel groups={nowResults} onOpenTask={onOpenTask} onOpenResource={onOpenResource}/>
        <RiskAheadPanel milestones={milestones} onOpenTask={onOpenTask}/>

        {/* Phase progress with status colors */}
        <div className="pw-card pw-card--phases">
          <div className="pw-card__head">
            <h3 className="pw-h3">フェーズ進捗</h3>
            <span className="pw-muted">{tasks.filter(t => t.isPhase).length} フェーズ</span>
          </div>
          <div className="pw-phases">
            {tasks.filter(t => t.isPhase).map(p => {
              const days = daysBetween(p.start, p.end) + 1;
              const meta = STATUS_BY_VALUE[p.status] || STATUSES[0];
              const isCurrent = parseDate(p.start) <= TODAY_DATE() && TODAY_DATE() <= parseDate(p.end);
              return (
                <div key={p.id} className={"pw-phase-row" + (isCurrent ? " pw-phase-row--current" : "")}>
                  <div className="pw-phase-row__head">
                    <span className="pw-phase-row__name">
                      <span className="pw-phase-row__dot" style={{ background: meta.color }}/>
                      {p.name}
                      {isCurrent && <span className="pw-phase-row__now">進行中</span>}
                    </span>
                    <span className="pw-phase-row__dates">{fmtJP(p.start)} – {fmtJP(p.end)} <span className="pw-muted">· {days}d</span></span>
                    <span className="pw-phase-row__pct">{Math.round(p.progress*100)}%</span>
                  </div>
                  <Progress value={p.progress} height={6} color={meta.color}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity / awareness — each entry navigates to the related task */}
        <div className="pw-card pw-card--activity">
          <div className="pw-card__head">
            <h3 className="pw-h3">アクティビティ</h3>
            <span className="pw-muted">直近 {ACTIVITY.length} 件</span>
          </div>
          <ul className="pw-activity">
            {ACTIVITY.map(a => {
              const r = resources.find(x => x.id === a.who);
              if (!r) return null;
              const isComment = a.kind === "comment";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="pw-activity__btn"
                    onClick={() => a.taskId && onOpenTask(a.taskId, isComment ? "comments" : null, a.commentId || null)}
                    disabled={!a.taskId}>
                    <Avatar resource={r} size={22}/>
                    <div className="pw-activity__body">
                      <div className="pw-activity__text">
                        {isComment && <span className="pw-activity__badge">💬</span>}
                        <strong>{r.name}</strong> が{a.text}
                      </div>
                      <div className="pw-activity__time">{a.time}</div>
                    </div>
                    <Icon name="chevronR" size={12} className="pw-activity__chev"/>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// 1-row health summary at the top of the dashboard.
function HealthBar({ daysRemaining, lateTaskCount, attentionCount }) {
  const intent = lateTaskCount > 0 ? "warn" : "ok";
  return (
    <div className={"pw-health-bar pw-health-bar--" + intent}>
      <div className="pw-health-bar__title">
        <div className="pw-eyebrow">プロジェクト</div>
        <h1 className="pw-h1">{PROJECT.name}</h1>
      </div>
      <div className="pw-health-bar__metrics">
        <Metric label="進捗">
          <strong>{Math.round(PROJECT_KPIS.progress*100)}%</strong>
        </Metric>
        <Metric label="残り">
          <strong>{daysRemaining}</strong> 日
        </Metric>
        <Metric label="遅延中">
          <strong className={lateTaskCount > 0 ? "pw-text-warn" : ""}>{lateTaskCount}</strong> 件
        </Metric>
        <Metric label="要注意">
          <strong className={attentionCount > 0 ? "pw-text-critical" : ""}>{attentionCount}</strong> 件
        </Metric>
        <Metric label="メンバー">
          <strong>{(window.RESOURCES || []).length}</strong> 名
        </Metric>
      </div>
      <div className="pw-health-bar__health">
        <HealthDot health={PROJECT_KPIS.health} />
      </div>
    </div>
  );
}

function Metric({ label, children }) {
  return (
    <div className="pw-metric">
      <div className="pw-metric__label">{label}</div>
      <div className="pw-metric__value">{children}</div>
    </div>
  );
}

// "要注意 (今)" panel — driven entirely by the DETECTORS_NOW array.
function AttentionPanel({ groups, onOpenTask, onOpenResource }) {
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <div className="pw-card pw-card--attention">
      <div className="pw-card__head">
        <h3 className="pw-h3">要注意 <span className="pw-muted">(今)</span></h3>
        <span className={"pw-tag " + (total > 0 ? "pw-tag--critical" : "pw-tag--ok")}>{total} 件</span>
      </div>
      {total === 0 && <div className="pw-attention__empty"><Icon name="check" size={18}/> 介入が必要な項目はありません</div>}
      {total > 0 && (
        <div className="pw-attention">
          {groups.map(g => (
            <div key={g.key} className="pw-attention__group">
              <div className="pw-attention__group-head">
                <Icon name={g.icon} size={12}/>
                <span>{g.label}</span>
                <span className="pw-attention__count">{g.items.length}</span>
              </div>
              <ul className="pw-attention__list">
                {g.items.slice(0, 4).map(it => (
                  <li key={it.id} className={"pw-attention__item pw-attention__item--" + it.severity}
                    onClick={() => {
                      if (it.kind === "task" && onOpenTask) onOpenTask(it.task.id);
                      if (it.kind === "resource" && onOpenResource) onOpenResource(it.resource.id);
                    }}>
                    <span className="pw-attention__sev" data-sev={it.severity}/>
                    <span className="pw-attention__name">{it.headline}</span>
                    <span className="pw-attention__reason">{it.reason}</span>
                  </li>
                ))}
                {g.items.length > 4 && (
                  <li className="pw-attention__more">他 {g.items.length - 4} 件</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// "リスクのある先" panel — milestones with a forward-looking risk evaluation.
function RiskAheadPanel({ milestones, onOpenTask }) {
  const upcoming = milestones.filter(m => isFutureISO(m.milestone.end) || m.status !== "ok").slice(0, 5);
  return (
    <div className="pw-card pw-card--risk-ahead">
      <div className="pw-card__head">
        <h3 className="pw-h3">リスクのある先</h3>
        <span className="pw-muted">マイルストーン {milestones.length}</span>
      </div>
      {upcoming.length === 0 && <div className="pw-attention__empty"><Icon name="check" size={18}/> 直近のマイルストーンはありません</div>}
      <ul className="pw-risk-ahead">
        {upcoming.map(({ milestone: m, riskyPreds, deepRisky, status }) => (
          <li key={m.id} className={"pw-risk-ahead__item pw-risk-ahead__item--" + status}
            onClick={() => onOpenTask(m.id)}>
            <div className="pw-risk-ahead__head">
              <Icon name="flagSm" size={12}/>
              <span className="pw-risk-ahead__name">{m.name}</span>
              <span className="pw-risk-ahead__date">{fmtJP(m.end)}</span>
            </div>
            <div className="pw-risk-ahead__status">
              {status === "ok" && <><Icon name="check" size={12}/> 順調</>}
              {status === "watch" && <><Icon name="bolt" size={12}/> 上流に注意 ({deepRisky.length}件)</>}
              {status === "risk" && (
                <><Icon name="bolt" size={12}/> 先行に問題 ({riskyPreds.length}件): {riskyPreds.map(p => p.name).join("、")}</>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Weekly load per resource. Returns { [resourceId]: number[] }.
//
// 仕様: 主担当タスクの占有率のみカウント (5 営業日 = 100%)。副担当は対象外。
//   load[r][w] = Σ(主担当タスクの週内重複日数) ÷ 5
//   100% = 1人分フル稼働 / 100%超過 = オーバーアロケート
//
// 副担当の貢献は別軸（リソースドロワーの「アサイン中タスク」一覧の件数）で
// 表現する。重ねると「忙しさ」と「関与」が混ざって意味が曖昧になるため、
// この指標は意図的に主担当だけに絞っている。
function computeWeeklyLoad(weeks = 24, startDate = PROJECT.startDate) {
  const start = parseDate(startDate);
  const tasks = window.TASKS || [];
  const resources = window.RESOURCES || [];
  const out = {};
  resources.forEach(r => { out[r.id] = new Array(weeks).fill(0); });
  tasks.forEach(t => {
    if (t.isPhase || !t.owner) return;
    const ts = parseDate(t.start);
    const te = parseDate(t.end);
    for (let w = 0; w < weeks; w++) {
      const wStart = addDays(start, w * 7);
      const wEnd = addDays(start, w * 7 + 7);
      if (te < wStart || ts > wEnd) continue;
      const a = ts > wStart ? ts : wStart;
      const b = te < wEnd ? te : wEnd;
      const overlapDays = Math.max(0, (b - a) / MS_DAY);
      if (out[t.owner]) out[t.owner][w] += overlapDays / 5;
    }
  });
  return out;
}

// ─────────── Resources ───────────
function ResourcesScreen({ onOpenTask, onOpenResource, onCreateResource, askDeleteResource }) {
  useTasks();         // re-render on task edits (load changes)
  const resources = useResources();
  const startISO = PROJECT.startDate;
  const start = parseDate(startISO);
  const weeks = 24;
  const weekW = 32;
  const weekLoads = computeWeeklyLoad(weeks, startISO);

  return (
    <div className="pw-res">
      <div className="pw-view-toolbar">
        <div className="pw-view-toolbar__left">
          <span className="pw-legend">
            <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"var(--accent)"}}/>稼働率</span>
            <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"#DC4C3F"}}/>過負荷</span>
          </span>
          <span className="pw-divider-v"/>
          <span className="pw-formula" title="主担当タスクの週内重複日数を5で割った値（5営業日=100%）。100%超 = オーバーアロケート。副担当タスクは含まない。">
            <span className="pw-muted">計算式:</span> 主担当タスクの週内重複日数 ÷ 5営業日
          </span>
        </div>
        <div className="pw-view-toolbar__right">
          <button className="pw-btn pw-btn--ghost pw-btn--sm"><Icon name="filter" size={14}/> フィルター</button>
          <span className="pw-divider-v"/>
          <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateResource}>
            <Icon name="plus" size={14}/> メンバー追加
          </button>
        </div>
      </div>

      <div className="pw-res__table">
        <div className="pw-res__head">
          <div className="pw-res__col-name">メンバー</div>
          <div className="pw-res__col-week" style={{ width: weeks * weekW }}>
            <div className="pw-res__weeks" style={{ width: weeks * weekW }}>
              {Array.from({length: weeks}).map((_, i) => {
                const d = addDays(start, i*7);
                const isMonthStart = d.getDate() <= 7;
                return (
                  <div key={i} className="pw-res__week" style={{ width: weekW }}>
                    {isMonthStart && <span className="pw-res__week-month">{d.getMonth()+1}月</span>}
                    <span className="pw-res__week-num">W{i+1}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pw-res__col-summary">合計</div>
        </div>
        <div className="pw-res__body">
          {resources.length === 0 && (
            <div className="pw-empty pw-empty--onboarding pw-empty--inline">
              <YuiPathMark size={56}/>
              <div className="pw-empty__title">メンバーがいません</div>
              <div className="pw-empty__sub">最初のメンバーを登録すると、稼働率がここに表示されます。</div>
              <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateResource}>
                <Icon name="plus" size={12}/> メンバー追加
              </button>
            </div>
          )}
          {resources.map(r => {
            const loads = weekLoads[r.id] || new Array(weeks).fill(0);
            const peak = Math.max(...loads);
            const avg = loads.reduce((a,b)=>a+b, 0) / weeks;
            return (
              <div key={r.id} className="pw-res__row pw-res__row--clickable"
                onClick={() => onOpenResource && onOpenResource(r.id)}>
                <div className="pw-res__col-name">
                  <Avatar resource={r} size={32}/>
                  <div>
                    <div className="pw-res__name">{r.name || "新規メンバー"}</div>
                    <div className="pw-res__role">{r.role || "—"}</div>
                  </div>
                </div>
                <div className="pw-res__col-week">
                  <div className="pw-res__hist" style={{ width: weeks * weekW }}>
                    {loads.map((v, i) => {
                      const pct = Math.min(v, 1.5);
                      const over = v > 1.0;
                      const bg = over ? "#DC4C3F" : "var(--accent)";
                      return (
                        <div key={i} className="pw-res__hist-cell" style={{ width: weekW }}>
                          <div className="pw-res__hist-bar" style={{
                            height: `${(pct/1.5) * 100}%`,
                            background: bg,
                            opacity: v === 0 ? 0 : (over ? 0.95 : 0.85),
                          }} title={`${Math.round(v*100)}%`}/>
                          {over && <span className="pw-res__over">!</span>}
                        </div>
                      );
                    })}
                    <div className="pw-res__threshold" />
                  </div>
                </div>
                <div className="pw-res__col-summary">
                  <div className={"pw-res__alloc" + (peak > 1.0 ? " pw-res__alloc--over" : "")}>
                    平均 {Math.round(avg*100)}% <span className="pw-muted">/ ピーク {Math.round(peak*100)}%</span>
                  </div>
                  {askDeleteResource && r.id !== CURRENT_USER_ID && (
                    <button
                      className="pw-icon-btn pw-icon-btn--sm pw-res__row-delete"
                      onClick={(e) => { e.stopPropagation(); askDeleteResource(r.id); }}
                      title="メンバーを削除">
                      <Icon name="trash" size={14}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────── Projects list (entry) ───────────
function ProjectsListScreen({ onSwitchProject, onEditProject, onCreateProject }) {
  const projects = useProjects();
  return (
    <div className="pw-projects">
      <div className="pw-section-head">
        <div>
          <h2 className="pw-h2">プロジェクト</h2>
          <p className="pw-muted">参加中のプロジェクト {projects.length} 件</p>
        </div>
        <div className="pw-section-head__tools">
          <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateProject}>
            <Icon name="plus" size={14}/> 新規プロジェクト
          </button>
        </div>
      </div>
      {projects.length === 0 && (
        <div className="pw-empty pw-empty--inline">
          <Icon name="folder" size={28}/>
          <div className="pw-empty__title">プロジェクトがありません</div>
          <div className="pw-empty__sub">「+ 新規プロジェクト」から最初のプロジェクトを作成してください</div>
          <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateProject}>
            <Icon name="plus" size={12}/> 新規プロジェクト
          </button>
        </div>
      )}
      <div className="pw-projects__grid">
        {projects.map(p => (
          <div key={p.id}
            className={"pw-proj-card" + (p.current ? " pw-proj-card--current" : "")}
            onClick={() => onSwitchProject(p.id)}
            role="button"
            tabIndex={0}>
            <div className="pw-proj-card__head">
              <div className="pw-proj-card__name">{p.name || "(名称未設定)"}</div>
              <HealthDot health={p.health}/>
            </div>
            <div className="pw-proj-card__client">{p.client || <span className="pw-muted">クライアント未設定</span>}</div>
            <div className="pw-proj-card__progress">
              <div className="pw-proj-card__pct">{Math.round((p.progress || 0)*100)}%</div>
              <Progress value={p.progress || 0} height={5}/>
            </div>
            <div className="pw-proj-card__foot">
              <span><Icon name="users" size={14}/> {p.members} 名</span>
              <span><Icon name="calendar" size={14}/> 期限 {p.endDate ? fmtJP(p.endDate) : "未設定"}</span>
            </div>
            {p.current && <div className="pw-proj-card__current-tag">表示中</div>}
            <button className="pw-proj-card__edit"
              onClick={(e) => { e.stopPropagation(); onEditProject(p.id); }}
              title="編集">
              <Icon name="moreH" size={14}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────── Task detail drawer (inline-editable, replaces the old modal) ───────────
function TaskDrawer({ taskId, scrollTo, scrollToCommentId, onClose, onDelete, askDeleteComment }) {
  // Re-render whenever the global tasks/comments stores change so live edits propagate.
  useTasks();
  useComments();
  const t = (window.TASKS || []).find(x => x.id === taskId);
  const commentsRef = React.useRef(null);

  // Esc closes. We register the listener unconditionally so the hook order is stable.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-scroll to a section when requested (e.g., "comments" from an activity click).
  React.useEffect(() => {
    if (!scrollTo) return;
    const target = scrollTo === "comments" ? commentsRef.current : null;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollTo, taskId]);

  if (!t) return null;

  const phases = (window.TASKS || []).filter(x => x.isPhase);
  const successors = (window.TASKS || []).filter(x => (x.predecessors || []).includes(t.id));
  const candidatePreds = (window.TASKS || []).filter(x => !x.isPhase && x.id !== t.id);

  // All edits go straight to the store. No save button.
  const patch = (p) => updateTask(t.id, p);

  // Status change drives progress for leaf tasks; blocked preserves current.
  const setStatus = (val) => {
    const p = { status: val };
    if (!t.isPhase) {
      const meta = STATUS_BY_VALUE[val];
      if (meta && meta.progress != null) p.progress = meta.progress;
    }
    patch(p);
  };

  // Date / duration arithmetic uses the active project's calendar. If the
  // user inverts the range, auto-snap the other endpoint.
  const calendar = getCalendarFor((window.PROJECTS || []).find(x => x.current));

  const setDate = (key, val) => {
    const p = { [key]: val };
    const next = { ...t, ...p };
    if (next.start && next.end && parseDate(next.start) > parseDate(next.end)) {
      if (key === "start") p.end = val;
      else p.start = val;
    }
    const recomputed = { ...t, ...p };
    if (recomputed.start && recomputed.end) {
      p.duration = Math.max(0, workingDaysBetween(recomputed.start, recomputed.end, calendar));
    }
    patch(p);
  };

  const setDuration = (val) => {
    const d = Math.max(1, Number(val) || 1);
    const p = { duration: d };
    if (t.start) p.end = addWorkingDays(t.start, d - 1, calendar);
    patch(p);
  };

  return (
    <>
      <div className="pw-drawer__backdrop" onClick={onClose} />
      <aside className="pw-drawer pw-drawer--editable">
        <div className="pw-drawer__head">
          <div className="pw-drawer__crumb">
            {t.parent && <span>{phases.find(x => x.id === t.parent)?.name} <Icon name="chevronR" size={12}/> </span>}
            <span>{t.isPhase ? "フェーズ" : "タスク"}</span>
          </div>
          <div className="pw-drawer__head-tools">
            {onDelete && !t.isPhase && (
              <button className="pw-icon-btn" onClick={() => onDelete(t.id)} title="削除">
                <Icon name="trash" size={16}/>
              </button>
            )}
            <button className="pw-icon-btn" title="リンクをコピー"><Icon name="link" size={16}/></button>
            <button className="pw-icon-btn"><Icon name="moreH" size={16}/></button>
            <button className="pw-icon-btn" onClick={onClose} title="閉じる"><Icon name="close" size={16}/></button>
          </div>
        </div>

        <div className="pw-drawer__title-row">
          <button
            className={"pw-check" + (t.status === "done" ? " pw-check--on" : "")}
            onClick={() => setStatus(t.status === "done" ? "todo" : "done")}
            title="完了切替">
            <Icon name="check" size={14}/>
          </button>
          <input
            className="pw-drawer__title-input"
            placeholder="タスク名を入力…"
            value={t.name}
            autoFocus={!t.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          {!t.isPhase && (
            <button
              type="button"
              className={"pw-pill pw-pill--milestone-toggle" + (t.milestone ? " is-on" : "")}
              onClick={() => patch({ milestone: !t.milestone })}
              title="マイルストーンとして扱う（ガントでひし形表示）">
              <Icon name="flagSm" size={12}/> マイルストーン
            </button>
          )}
        </div>
        {t.critical && (
          <div className="pw-drawer__cp-banner">
            <Icon name="bolt" size={14}/> このタスクは <strong>クリティカルパス</strong> 上にあります。遅延はプロジェクト全体に影響します。
          </div>
        )}

        <div className="pw-drawer__props">
          <PropRow label="ステータス">
            <StatusPillRow value={t.status} onChange={setStatus}/>
          </PropRow>

          <PropRow label="進捗" hint="ステータスから自動算出。微調整したい場合のみ上書き">
            <div className="pw-prop-progress">
              <input type="range" min="0" max="100" step="5"
                value={Math.round((t.progress || 0) * 100)}
                onChange={(e) => patch({ progress: Number(e.target.value) / 100 })}/>
              <span className="pw-prop-progress__pct">{Math.round((t.progress || 0) * 100)}%</span>
            </div>
          </PropRow>

          {!t.isPhase && (
            <PropRow label="主担当">
              <PersonPicker value={t.owner || ""}
                onChange={(v) => patch({ owner: v || undefined })}
                exclude={t.subs || []}/>
            </PropRow>
          )}

          {!t.isPhase && (
            <PropRow label="副担当">
              <PeoplePicker values={t.subs || []}
                onChange={(v) => patch({ subs: v })}
                exclude={t.owner ? [t.owner] : []}/>
            </PropRow>
          )}

          <PropRow label="開始日">
            <input type="date" className="pw-input pw-input--inline"
              value={t.start || ""}
              onChange={(e) => setDate("start", e.target.value)}/>
          </PropRow>
          <PropRow label="終了日">
            <input type="date" className="pw-input pw-input--inline"
              value={t.end || ""}
              onChange={(e) => setDate("end", e.target.value)}/>
          </PropRow>

          {!t.isPhase && (
            <PropRow label="期間">
              <div className="pw-duration">
                <input type="number" min="1" className="pw-input pw-input--inline pw-input--num"
                  value={t.duration || 1}
                  onChange={(e) => setDuration(e.target.value)}/>
                <span className="pw-muted">営業日</span>
              </div>
            </PropRow>
          )}

          {!t.isPhase && (
            <PropRow label="フェーズ">
              <select className="pw-select pw-select--inline"
                value={t.parent || ""}
                onChange={(e) => patch({ parent: e.target.value })}>
                {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </PropRow>
          )}

          {!t.isPhase && (
            <PropRow label="先行タスク (FS)">
              <PredecessorPicker values={t.predecessors || []}
                onChange={(v) => patch({ predecessors: v })}
                tasks={candidatePreds}
                onOpenTask={null}/>
            </PropRow>
          )}

          {!t.isPhase && successors.length > 0 && (
            <PropRow label="後続タスク">
              <div className="pw-prop-deps">
                {successors.map(s => (
                  <span key={s.id} className="pw-chip pw-chip--dep">
                    <Icon name="link" size={12}/> {s.name}
                  </span>
                ))}
              </div>
            </PropRow>
          )}
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">説明</h4>
          <textarea className="pw-textarea pw-drawer__desc-edit"
            placeholder="作業内容、受け入れ基準、関連ドキュメントへのリンクなど…"
            value={t.description || ""}
            onChange={(e) => patch({ description: e.target.value })}
            rows={4}/>
        </div>

        {!t.isPhase && (
          <div className="pw-drawer__section">
            <h4 className="pw-h4">ベースライン比較</h4>
            <div className="pw-baseline">
              <div className="pw-baseline__row">
                <span className="pw-baseline__label">計画</span>
                <span className="pw-baseline__bar">
                  <span className="pw-baseline__fill pw-baseline__fill--plan" style={{ width: "100%" }}/>
                </span>
                <span className="pw-baseline__val">{fmtJP(t.start)} – {fmtJP(t.end)}</span>
              </div>
              <div className="pw-baseline__row">
                <span className="pw-baseline__label">実績</span>
                <span className="pw-baseline__bar">
                  <span className="pw-baseline__fill pw-baseline__fill--actual" style={{ width: `${(t.progress || 0)*100}%` }}/>
                </span>
                <span className="pw-baseline__val">{Math.round((t.progress || 0)*100)}% 完了</span>
              </div>
            </div>
          </div>
        )}

        <div ref={commentsRef} className="pw-drawer__section">
          <CommentThread
            taskId={t.id}
            highlight={scrollTo === "comments"}
            scrollToCommentId={scrollToCommentId}
            askDeleteComment={askDeleteComment}/>
        </div>
      </aside>
    </>
  );
}

// ─────────── Comment thread (used inside TaskDrawer) ───────────
function CommentThread({ taskId, highlight, scrollToCommentId, askDeleteComment }) {
  useComments();
  const items = (window.COMMENTS || [])
    .filter(c => c.taskId === taskId)
    .sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const [draft, setDraft] = React.useState("");
  const me = (window.RESOURCES || []).find(r => r.id === CURRENT_USER_ID);
  const inputRef = React.useRef(null);

  // Scroll to a specific comment if requested. Falls back to "scroll the
  // section into view" when only `highlight` is set without a target id.
  const targetRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollToCommentId && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (highlight && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scrollToCommentId, highlight, taskId]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addComment(taskId, trimmed);
    setDraft("");
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); submit();
    }
  };

  return (
    <>
      <h4 className="pw-h4">
        コメント <span className="pw-muted">{items.length}</span>
      </h4>

      <div className="pw-comments">
        {items.length === 0 && (
          <div className="pw-comments__empty">まだコメントはありません</div>
        )}
        {items.map(c => (
          <CommentItem
            key={c.id}
            comment={c}
            isHighlighted={c.id === scrollToCommentId}
            innerRef={c.id === scrollToCommentId ? targetRef : null}
            askDeleteComment={askDeleteComment}/>
        ))}
      </div>

      <div className="pw-comment-form">
        {me && <Avatar resource={me} size={28}/>}
        <div className="pw-comment-form__input-wrap">
          <textarea
            ref={inputRef}
            className="pw-comment-form__input"
            placeholder="コメントを追加… (⌘+Enter で送信)"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}/>
          <div className="pw-comment-form__foot">
            <span className="pw-muted">⌘+Enter で送信</span>
            <button
              className="pw-btn pw-btn--primary pw-btn--sm"
              disabled={!draft.trim()}
              onClick={submit}>
              送信
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CommentItem({ comment: c, isHighlighted, innerRef, askDeleteComment }) {
  const author = (window.RESOURCES || []).find(r => r.id === c.authorId);
  const isMine = c.authorId === CURRENT_USER_ID;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.body);

  React.useEffect(() => { setDraft(c.body); }, [c.body]);

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    updateComment(c.id, trimmed);
    setEditing(false);
  };
  const cancel = () => { setDraft(c.body); setEditing(false); };

  return (
    <div ref={innerRef}
      className={"pw-comment" + (isHighlighted ? " pw-comment--highlight" : "")}>
      {author && <Avatar resource={author} size={28}/>}
      <div className="pw-comment__body">
        <div className="pw-comment__head">
          <strong className="pw-comment__author">{author?.name || "(削除済み)"}</strong>
          <span className="pw-comment__time">{fmtRelativeTime(c.createdAt)}</span>
          {c.editedAt && <span className="pw-comment__edited">(編集済)</span>}
          {isMine && !editing && (
            <div className="pw-comment__actions">
              <button className="pw-comment__action" onClick={() => setEditing(true)}>編集</button>
              <button className="pw-comment__action pw-comment__action--danger"
                onClick={() => askDeleteComment ? askDeleteComment(c.id) : deleteComment(c.id)}>
                削除
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="pw-comment__edit">
            <textarea
              className="pw-comment-form__input"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus/>
            <div className="pw-comment__edit-foot">
              <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={cancel}>キャンセル</button>
              <button className="pw-btn pw-btn--primary pw-btn--sm" disabled={!draft.trim()} onClick={save}>保存</button>
            </div>
          </div>
        ) : (
          <div className="pw-comment__text">{c.body}</div>
        )}
      </div>
    </div>
  );
}

function StatusPillRow({ value, onChange }) {
  return (
    <div className="pw-status-radio">
      {STATUSES.map(s => (
        <button key={s.value}
          className={"pw-pill pw-pill--status" + (value === s.value ? " is-active" : "")}
          style={{ "--pill-color": s.color }}
          onClick={() => onChange(s.value)}>
          <span className="pw-pill__dot" style={{ background: s.color }}/>
          {s.label}
        </button>
      ))}
    </div>
  );
}

function PropRow({ label, hint, children }) {
  return (
    <div className="pw-prop">
      <div className="pw-prop__label">{label}</div>
      <div className="pw-prop__value">
        {children}
        {hint && <div className="pw-prop__hint">{hint}</div>}
      </div>
    </div>
  );
}

// ─────────── Resource detail drawer (inline-editable, mirrors TaskDrawer) ───────────
function ResourceDrawer({ resourceId, onClose, onDelete, onOpenTask }) {
  useResources();
  useTasks();
  const r = (window.RESOURCES || []).find(x => x.id === resourceId);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!r) return null;

  const tasks = window.TASKS || [];
  const ownedTasks = tasks.filter(t => !t.isPhase && t.owner === r.id);
  const subTasks = tasks.filter(t => !t.isPhase && (t.subs || []).includes(r.id));
  const totalDays = [...ownedTasks, ...subTasks].reduce((s, t) => s + (t.duration || 0), 0);

  // Reuse the same weekly load math used by the resources screen.
  const weeks = 24;
  const loads = (computeWeeklyLoad(weeks, PROJECT.startDate)[r.id]) || new Array(weeks).fill(0);
  const peak = Math.max(...loads);
  const avg = loads.reduce((a,b)=>a+b, 0) / weeks;

  const patch = (p) => updateResource(r.id, p);

  return (
    <>
      <div className="pw-drawer__backdrop" onClick={onClose} />
      <aside className="pw-drawer pw-drawer--editable">
        <div className="pw-drawer__head">
          <div className="pw-drawer__crumb">
            <span>メンバー</span>
          </div>
          <div className="pw-drawer__head-tools">
            {onDelete && r.id !== CURRENT_USER_ID && (
              <button className="pw-icon-btn" onClick={() => onDelete(r.id)} title="削除">
                <Icon name="trash" size={16}/>
              </button>
            )}
            <button className="pw-icon-btn"><Icon name="moreH" size={16}/></button>
            <button className="pw-icon-btn" onClick={onClose} title="閉じる"><Icon name="close" size={16}/></button>
          </div>
        </div>

        <div className="pw-drawer__title-row pw-drawer__title-row--res">
          <Avatar resource={r} size={48}/>
          <div className="pw-drawer__title-stack">
            <input
              className="pw-drawer__title-input"
              placeholder="名前を入力…"
              value={r.name || ""}
              autoFocus={!r.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <input
              className="pw-input pw-input--inline pw-drawer__subtitle-input"
              placeholder="ロール（例: PM, Backend, Designer）"
              value={r.role || ""}
              onChange={(e) => patch({ role: e.target.value })}
            />
          </div>
        </div>

        <div className="pw-drawer__props">
          <PropRow label="アバター色">
            <div className="pw-color-swatches">
              {RESOURCE_COLORS.map(c => (
                <button key={c}
                  type="button"
                  className={"pw-color-swatch" + (r.color === c ? " is-active" : "")}
                  style={{ background: c }}
                  onClick={() => patch({ color: c })}
                  title={c}/>
              ))}
            </div>
          </PropRow>

          <PropRow label="英語名">
            <input type="text" className="pw-input pw-input--inline"
              placeholder="例: Misaki Tanaka"
              value={r.enName || ""}
              onChange={(e) => patch({ enName: e.target.value })}/>
          </PropRow>

          <PropRow label="キャパシティ" hint="1.0 = フルタイム稼働。短時間勤務や兼務時は下げる">
            <div className="pw-prop-progress">
              <input type="range" min="0" max="150" step="5"
                value={Math.round((r.capacity ?? 1) * 100)}
                onChange={(e) => patch({ capacity: Number(e.target.value) / 100 })}/>
              <span className="pw-prop-progress__pct">{Math.round((r.capacity ?? 1) * 100)}%</span>
            </div>
          </PropRow>

          <PropRow label="現在のアロケーション">
            <span className={"pw-pill " + (peak > 1.0 ? "pw-pill--blocked" : peak > 0.8 ? "pw-pill--inprogress" : "pw-pill--done")}>
              平均 {Math.round(avg*100)}% · ピーク {Math.round(peak*100)}%
            </span>
          </PropRow>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">
            週次負荷（24週）
            <span className="pw-muted pw-h4__sub" title="主担当タスクの週内重複日数 ÷ 5営業日">
              主担当タスクのみ・5営業日=100%
            </span>
          </h4>
          <div className="pw-res-mini-hist">
            {loads.map((v, i) => {
              const pct = Math.min(v, 1.5);
              const over = v > 1.0;
              return (
                <div key={i} className="pw-res-mini-hist__cell" title={`W${i+1}: ${Math.round(v*100)}%`}>
                  <div className="pw-res-mini-hist__bar"
                    style={{
                      height: `${(pct/1.5) * 100}%`,
                      background: over ? "var(--critical)" : "var(--accent)",
                      opacity: v === 0 ? 0 : (over ? 0.95 : 0.85),
                    }}/>
                </div>
              );
            })}
            <div className="pw-res-mini-hist__threshold"/>
          </div>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">アサイン中タスク <span className="pw-muted">合計 {totalDays}d</span></h4>
          {ownedTasks.length === 0 && subTasks.length === 0 ? (
            <p className="pw-muted">アサインされているタスクはありません</p>
          ) : (
            <div className="pw-res-tasks">
              {ownedTasks.map(t => (
                <button key={t.id} className="pw-res-task" onClick={() => onOpenTask && onOpenTask(t.id)}>
                  <span className="pw-res-task__role">主担当</span>
                  <span className="pw-res-task__name">{t.name}</span>
                  <span className="pw-res-task__meta">{t.duration}d · {fmtJP(t.start)}–{fmtJP(t.end)}</span>
                  <StatusPill status={t.status} compact/>
                </button>
              ))}
              {subTasks.map(t => (
                <button key={t.id} className="pw-res-task pw-res-task--sub" onClick={() => onOpenTask && onOpenTask(t.id)}>
                  <span className="pw-res-task__role">副担当</span>
                  <span className="pw-res-task__name">{t.name}</span>
                  <span className="pw-res-task__meta">{t.duration}d · {fmtJP(t.start)}–{fmtJP(t.end)}</span>
                  <StatusPill status={t.status} compact/>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─────────── Project drawer (inline-editable, mirrors Task/Resource drawers) ───────────
//
// Editable: name / client / description / startDate / endDate / baselineEnd
// Derived (read-only):
//   - progress    ← roll-up from tasks (mocked: shows the stored value)
//   - health      ← rule engine over tasks/dates  (mocked: stored value)
//   - members     ← unique resources assigned to this project's tasks
//                   (mocked: stored value; real impl needs per-project tasks)
//
// TODO: メンバー紐付けは「プロジェクト作成後にタスクへアサインする結果として浮上」
//       させる設計。専用の "メンバー管理" UI は別途。

const HEALTH_LABEL = {
  "on-track":  { label: "順調", color: "#2A8C6E" },
  "at-risk":   { label: "注意", color: "#C57F1A" },
  "off-track": { label: "遅延", color: "#DC4C3F" },
};

function ProjectDrawer({ projectId, onClose, onDelete, onSwitchTo, onOpenSettings }) {
  useProjects();
  const p = (window.PROJECTS || []).find(x => x.id === projectId);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!p) return null;

  const patch = (px) => updateProject(p.id, px);

  // Date change auto-shifts baselineEnd if it was tracking the original end
  // date, and snaps the other endpoint if the user inverts the range.
  const setDate = (key, val) => {
    const nextPatch = { [key]: val };
    if (key === "endDate" && (p.baselineEnd === p.endDate || !p.baselineEnd)) {
      nextPatch.baselineEnd = val;
    }
    const next = { ...p, ...nextPatch };
    if (next.startDate && next.endDate && parseDate(next.startDate) > parseDate(next.endDate)) {
      if (key === "startDate") nextPatch.endDate = val;
      else nextPatch.startDate = val;
    }
    patch(nextPatch);
  };

  const totalDays = (p.startDate && p.endDate)
    ? daysBetween(p.startDate, p.endDate) + 1
    : 0;

  const healthMeta = HEALTH_LABEL[p.health] || HEALTH_LABEL["on-track"];

  return (
    <>
      <div className="pw-drawer__backdrop" onClick={onClose} />
      <aside className="pw-drawer pw-drawer--editable">
        <div className="pw-drawer__head">
          <div className="pw-drawer__crumb">
            <span>プロジェクト{p.current && <span className="pw-drawer__crumb-now"> · 表示中</span>}</span>
          </div>
          <div className="pw-drawer__head-tools">
            {!p.current && onSwitchTo && (
              <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={() => onSwitchTo(p.id)}>
                このプロジェクトに切替
              </button>
            )}
            {onDelete && (
              <button className="pw-icon-btn" onClick={() => onDelete(p.id)} title="削除">
                <Icon name="trash" size={16}/>
              </button>
            )}
            <button className="pw-icon-btn" onClick={onClose} title="閉じる"><Icon name="close" size={16}/></button>
          </div>
        </div>

        <div className="pw-drawer__title-row">
          <input
            className="pw-drawer__title-input"
            placeholder="プロジェクト名を入力…"
            value={p.name || ""}
            autoFocus={!p.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        {/* Editable: intent / planning fields */}
        <div className="pw-drawer__props">
          <PropRow label="クライアント">
            <input type="text" className="pw-input pw-input--inline"
              placeholder="例: 株式会社サンプル / 社内チーム"
              value={p.client || ""}
              onChange={(e) => patch({ client: e.target.value })}/>
          </PropRow>

          <PropRow label="開始日">
            <input type="date" className="pw-input pw-input--inline"
              value={p.startDate || ""}
              onChange={(e) => setDate("startDate", e.target.value)}/>
          </PropRow>

          <PropRow label="終了日">
            <input type="date" className="pw-input pw-input--inline"
              value={p.endDate || ""}
              onChange={(e) => setDate("endDate", e.target.value)}/>
          </PropRow>

          <PropRow label="ベースライン終了日" hint="計画上の終了日。終了日と乖離すると遅延">
            <input type="date" className="pw-input pw-input--inline"
              value={p.baselineEnd || ""}
              onChange={(e) => patch({ baselineEnd: e.target.value })}/>
          </PropRow>

          <PropRow label="期間">
            <span className="pw-prop__readonly">{totalDays > 0 ? `${totalDays} 日` : "—"}</span>
          </PropRow>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">説明</h4>
          <textarea className="pw-textarea pw-drawer__desc-edit"
            placeholder="プロジェクトの目的・スコープ・成果物などを記述…"
            value={p.description || ""}
            onChange={(e) => patch({ description: e.target.value })}
            rows={4}/>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">稼働カレンダー</h4>
          <CalendarPicker
            calendarId={p.calendarId}
            onChange={(id) => patch({ calendarId: id })}
            onEditClick={() => onOpenSettings && onOpenSettings()}/>
        </div>

        {/* Read-only: derived from tasks/resources at runtime in real impl */}
        <div className="pw-drawer__section">
          <h4 className="pw-h4">現在の状態 <span className="pw-muted">（タスクから自動算出）</span></h4>
          <div className="pw-drawer__props pw-drawer__props--readonly">
            <PropRow label="進捗">
              <div className="pw-prop-progress">
                <Progress value={p.progress || 0} height={6}/>
                <span className="pw-prop-progress__pct">{Math.round((p.progress || 0) * 100)}%</span>
              </div>
            </PropRow>
            <PropRow label="健康状態">
              <span className="pw-pill pw-pill--status-chip" style={{ "--pill-color": healthMeta.color }}>
                <span className="pw-pill__dot" style={{ background: healthMeta.color }}/>
                {healthMeta.label}
              </span>
            </PropRow>
            <PropRow label="メンバー">
              <span className="pw-prop__readonly">
                {(p.members ?? 0) > 0 ? `${p.members} 名` : "—"}
                <span className="pw-muted"> · タスクへのアサインから自動集計</span>
              </span>
            </PropRow>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────── Calendar picker (simple dropdown for ProjectDrawer) ───────────
// Editing happens in the Settings screen, not here.
const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function CalendarPicker({ calendarId, onChange, onEditClick }) {
  const calendars = useCalendars();
  return (
    <div className="pw-cal-picker">
      <div className="pw-cal-picker__head">
        <select className="pw-select pw-select--inline pw-cal-picker__select"
          value={calendarId || (calendars[0]?.id ?? "")}
          onChange={(e) => onChange(e.target.value)}>
          {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={onEditClick} title="設定でカレンダーを編集">
          <Icon name="settings" size={12}/> 設定で編集
        </button>
      </div>
    </div>
  );
}

// ─────────── Settings screen ───────────
// Global settings (calendars, future: notifications, etc.). Reachable from
// the sidebar foot. Two-pane layout: section nav (left) + content (right).

function SettingsScreen({ initialFocusCalendarId, askDeleteCalendar, askDeleteHoliday }) {
  // Sections defined as a small registry so future ones (notifications,
  // members, integrations) plug in without restructuring the shell.
  const sections = [
    { key: "calendars", label: "カレンダー",       icon: "calendar" },
    { key: "language",  label: "言語",             icon: "globe" },
    { key: "about",     label: "YuiPath について", icon: "info" },
  ];
  const [active, setActive] = React.useState("calendars");

  return (
    <div className="pw-settings">
      <div className="pw-settings__nav">
        {sections.map(s => (
          <button key={s.key}
            className={"pw-settings__nav-item" + (active === s.key ? " is-active" : "")}
            onClick={() => setActive(s.key)}>
            <Icon name={s.icon} size={14}/>
            {s.label}
          </button>
        ))}
      </div>
      <div className="pw-settings__content">
        {active === "calendars" && (
          <CalendarsSettings
            initialFocusCalendarId={initialFocusCalendarId}
            askDeleteCalendar={askDeleteCalendar}
            askDeleteHoliday={askDeleteHoliday}/>
        )}
        {active === "language" && <LanguageSettings/>}
        {active === "about"    && <AboutSettings/>}
      </div>
    </div>
  );
}

// ─────────── Language settings ───────────
// Display-only in the mock — picking a language doesn't actually swap UI text,
// it just shows where the surface lives.
function LanguageSettings() {
  const [lang, setLang] = React.useState("ja");
  const options = [
    { value: "ja", label: "日本語",   sub: "Japanese" },
    { value: "en", label: "English",  sub: "英語" },
  ];
  return (
    <div className="pw-about">
      <div className="pw-about__head">
        <h2 className="pw-h2">言語</h2>
        <p className="pw-muted">アプリの表示言語を選択します。</p>
      </div>
      <div className="pw-lang__list">
        {options.map(o => (
          <button key={o.value}
            className={"pw-lang__item" + (lang === o.value ? " is-active" : "")}
            onClick={() => setLang(o.value)}>
            <span className="pw-lang__check">
              {lang === o.value && <Icon name="check" size={12}/>}
            </span>
            <div className="pw-lang__text">
              <div className="pw-lang__name">{o.label}</div>
              <div className="pw-lang__sub">{o.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="pw-about__note">
        ※ モックでは選択を保存するだけで、実際の表示言語は切り替わりません。
      </p>
    </div>
  );
}

// ─────────── About settings ───────────
function AboutSettings() {
  return (
    <div className="pw-about">
      <div className="pw-about__hero">
        <YuiPathMark size={88} animated className="pw-about__hero-mark"/>
        <div>
          <YuiPathWordmark height={36}/>
          <p className="pw-about__hero-sub">
            シンプルに使える、オープンソースのプロジェクト管理ツール
          </p>
          <p className="pw-about__hero-meta">v0.1.0 (mock) · Apache License 2.0</p>
        </div>
      </div>

      <section className="pw-about__section">
        <h3 className="pw-about__h3">設計思想</h3>
        <ul className="pw-about__list">
          <li>
            <strong>シンプルに、本質だけ。</strong>
            <span>タスク・期間・進捗・依存関係。PM の核を扱い、機能の網羅性は追わない。</span>
          </li>
          <li>
            <strong>正直な数字だけ出す。</strong>
            <span>EVM や予測値など、データが揃わないと嘘になる指標は出さない。表示するのは実データから導けるものだけ。</span>
          </li>
          <li>
            <strong>読める / 軽い UI。</strong>
            <span>Notion ライクな柔らかいタイポと配色。データ密度は控えめ、必要な情報に視線を向けやすく。</span>
          </li>
          <li>
            <strong>ローカルファースト。</strong>
            <span>個人利用は Tauri デスクトップ（オフライン・データは手元）。チームは AWS バックエンドで同期。</span>
          </li>
          <li>
            <strong>AI は外付け。</strong>
            <span>コア製品は AI 依存ゼロ。必要なら MCP 経由で外部 AI と連携できる、という設計。</span>
          </li>
        </ul>
      </section>

      <section className="pw-about__section">
        <h3 className="pw-about__h3">使い方</h3>
        <ol className="pw-about__steps">
          <li>
            <span className="pw-about__step-num">1</span>
            <div>
              <strong>プロジェクトを作る</strong>
              <span>左サイドバーの「プロジェクト」から新規作成、または「すべてのプロジェクト」から切替。</span>
            </div>
          </li>
          <li>
            <span className="pw-about__step-num">2</span>
            <div>
              <strong>タスクを並べる</strong>
              <span>テーブル画面でフェーズ → タスクを追加。CSV インポートにも対応。</span>
            </div>
          </li>
          <li>
            <span className="pw-about__step-num">3</span>
            <div>
              <strong>ガントで日程を確認</strong>
              <span>依存関係・クリティカルパス・マイルストーンを視覚化。バーをドラッグして調整（予定）。</span>
            </div>
          </li>
          <li>
            <span className="pw-about__step-num">4</span>
            <div>
              <strong>ダッシュボードでシグナルを拾う</strong>
              <span>「要注意」パネルが遅延・期限超過・未割当などを自動で検出。</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="pw-about__section">
        <h3 className="pw-about__h3">ライセンスと商標</h3>
        <ul className="pw-about__meta-list">
          <li><span className="pw-about__meta-key">ライセンス</span><span>Apache License 2.0</span></li>
          <li><span className="pw-about__meta-key">著作権</span><span>Copyright © 2026 n-guitar</span></li>
          <li><span className="pw-about__meta-key">商標</span><span>"YuiPath" は n-guitar の商標です（TRADEMARKS.md 参照）</span></li>
        </ul>
      </section>

      <section className="pw-about__section pw-about__support">
        <h3 className="pw-about__h3">プロジェクトを応援する</h3>
        <p className="pw-about__support-lead">
          YuiPath は無料・オープンソースで開発しています。役立っていれば、ぜひ応援を。
        </p>
        <div className="pw-about__cta-row">
          <a className="pw-btn pw-btn--primary pw-btn--sm"
             href="https://github.com/n-guitar/YuiPath"
             target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">⭐</span> Star on GitHub
          </a>
          <a className="pw-btn pw-btn--ghost pw-btn--sm"
             href="https://github.com/n-guitar/YuiPath/issues"
             target="_blank" rel="noopener noreferrer">
            <Icon name="bolt" size={13}/> Issue を報告
          </a>
        </div>
      </section>
    </div>
  );
}

function CalendarsSettings({ initialFocusCalendarId, askDeleteCalendar, askDeleteHoliday }) {
  const calendars = useCalendars();
  const projects = useProjects();
  const [selectedId, setSelectedId] = React.useState(
    initialFocusCalendarId || calendars[0]?.id || null
  );

  // Re-resolve when the calendars list changes (delete/add)
  React.useEffect(() => {
    if (!calendars.find(c => c.id === selectedId)) {
      setSelectedId(calendars[0]?.id || null);
    }
  }, [calendars.length, selectedId]);

  const cal = calendars.find(c => c.id === selectedId);
  const usedByCount = cal ? projects.filter(p => p.calendarId === cal.id).length : 0;

  const handleAdd = () => {
    const id = addCalendar("新しいカレンダー");
    setSelectedId(id);
  };
  const canDelete = cal && calendars.length > 1 && usedByCount === 0;
  const handleDelete = () => {
    if (!cal) return;
    if (askDeleteCalendar) askDeleteCalendar(cal.id);
    else if (canDelete) deleteCalendar(cal.id);
  };

  return (
    <div className="pw-cal-settings">
      <aside className="pw-cal-settings__list">
        <div className="pw-cal-settings__list-head">
          <h4 className="pw-h4">カレンダー</h4>
          <button className="pw-icon-btn" onClick={handleAdd} title="新規カレンダー">
            <Icon name="plus" size={14}/>
          </button>
        </div>
        <ul className="pw-cal-settings__list-items">
          {calendars.map(c => {
            const used = projects.filter(p => p.calendarId === c.id).length;
            return (
              <li key={c.id}>
                <button
                  className={"pw-cal-settings__item" + (c.id === selectedId ? " is-active" : "")}
                  onClick={() => setSelectedId(c.id)}>
                  <span className="pw-cal-settings__item-name">{c.name}</span>
                  <span className="pw-cal-settings__item-count">{used} プロジェクト</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="pw-cal-settings__editor">
        {!cal && (
          <div className="pw-empty">
            <Icon name="calendar" size={28}/>
            <div className="pw-empty__title">カレンダーがありません</div>
            <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={handleAdd}>
              <Icon name="plus" size={12}/> 新規カレンダー
            </button>
          </div>
        )}
        {cal && (
          <>
            <div className="pw-cal-settings__editor-head">
              <input type="text" className="pw-cal-settings__name-input"
                value={cal.name}
                onChange={(e) => updateCalendar(cal.id, { name: e.target.value })}/>
              <div className="pw-cal-settings__editor-tools">
                {canDelete ? (
                  <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={handleDelete}>
                    <Icon name="trash" size={12}/> 削除
                  </button>
                ) : usedByCount > 0 ? (
                  <span className="pw-muted pw-cal-settings__usage">
                    {usedByCount} プロジェクトで使用中
                  </span>
                ) : null}
              </div>
            </div>
            <CalendarTemplateEditor
              calendar={cal}
              usedByCount={usedByCount}
              askDeleteHoliday={askDeleteHoliday}
              embedded/>
          </>
        )}
      </div>
    </div>
  );
}

function CalendarTemplateEditor({ calendar: cal, usedByCount, embedded, askDeleteHoliday }) {
  const [draftDate, setDraftDate] = React.useState("");
  const [draftName, setDraftName] = React.useState("");

  const toggleDay = (i) => {
    const next = [...cal.workingDays];
    next[i] = !next[i];
    updateCalendar(cal.id, { workingDays: next });
  };
  // Upsert: if the date already exists, just update its name (so "追加" never
  // silently fails when picking an existing date). Otherwise append.
  const addHoliday = () => {
    if (!draftDate) return;
    const list = cal.holidays || [];
    const name = draftName.trim() || "祝日";
    const existing = list.find(h => h.date === draftDate);
    const next = existing
      ? list.map(h => h.date === draftDate ? { ...h, name } : h)
      : [...list, { date: draftDate, name }];
    updateCalendar(cal.id, { holidays: next });
    setDraftDate(""); setDraftName("");
  };
  const removeHoliday = (date) => {
    if (askDeleteHoliday) askDeleteHoliday(cal.id, date);
    else updateCalendar(cal.id, { holidays: (cal.holidays || []).filter(h => h.date !== date) });
  };

  const sorted = [...(cal.holidays || [])].sort((a, b) => a.date < b.date ? -1 : 1);

  return (
    <div className="pw-cal-edit">
      {usedByCount >= 1 && (
        <div className="pw-cal-edit__warn">
          ⚠️ このカレンダーは <strong>{usedByCount} プロジェクト</strong>で使用中です。
          祝日の<strong>追加・削除・曜日変更</strong>はすべて、対象プロジェクトの今後のタスク日数計算に影響します。
        </div>
      )}

      {!embedded && (
        <div className="pw-cal-edit__row">
          <label className="pw-cal-edit__label">名前</label>
          <input type="text" className="pw-input pw-input--inline"
            value={cal.name}
            onChange={(e) => updateCalendar(cal.id, { name: e.target.value })}/>
        </div>
      )}

      <div className="pw-cal-edit__row">
        <label className="pw-cal-edit__label">稼働曜日</label>
        <div className="pw-cal-edit__weekdays">
          {WEEKDAY_NAMES.map((d, i) => (
            <button key={i} type="button"
              className={"pw-cal-edit__weekday"
                + (cal.workingDays[i] ? " is-on" : "")
                + (i === 0 ? " pw-cal-edit__weekday--sun" : "")
                + (i === 6 ? " pw-cal-edit__weekday--sat" : "")}
              onClick={() => toggleDay(i)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="pw-cal-edit__row">
        <label className="pw-cal-edit__label">祝日・非稼働日 <span className="pw-muted">({sorted.length})</span></label>
        <div className="pw-cal-edit__holidays">
          {sorted.length === 0 && (
            <div className="pw-muted pw-cal-edit__empty">登録された祝日はありません</div>
          )}
          {sorted.length > 0 && (
            <ul className="pw-holidays__list">
              {sorted.map(h => (
                <li key={h.date} className="pw-holidays__item">
                  <span className="pw-holidays__date">{fmtJP(h.date)}</span>
                  <span className="pw-holidays__name">{h.name}</span>
                  <button className="pw-icon-btn pw-icon-btn--sm" onClick={() => removeHoliday(h.date)} title="削除">
                    <Icon name="close" size={12}/>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pw-holidays__add">
            <input type="date" className="pw-input pw-input--inline"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}/>
            <input type="text" className="pw-input pw-input--inline"
              placeholder={draftDate && (cal.holidays || []).find(h => h.date === draftDate)
                ? `現在: ${(cal.holidays || []).find(h => h.date === draftDate).name}`
                : "名称（例: 創立記念日）"}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}/>
            {(() => {
              const overwrite = draftDate && (cal.holidays || []).some(h => h.date === draftDate);
              return (
                <button
                  className={"pw-btn pw-btn--sm " + (overwrite ? "pw-btn--ghost pw-cal-edit__overwrite" : "pw-btn--ghost")}
                  onClick={addHoliday}
                  disabled={!draftDate}>
                  <Icon name={overwrite ? "edit" : "plus"} size={12}/>
                  {overwrite ? "上書き" : "追加"}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── Confirm dialog (modal) ───────────
// Reusable for any irreversible action. Driven by App-level state via
// `askConfirm({ title, body, confirmLabel, destructive, onConfirm })`.
function ConfirmDialog({ title, body, confirmLabel = "削除", destructive, onConfirm, onCancel }) {
  const confirmRef = React.useRef(null);
  React.useEffect(() => {
    confirmRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  React.useEffect(() => {
    // Capture-phase + stopImmediatePropagation so the underlying drawer's
    // keydown listener doesn't ALSO close itself when the dialog handles Esc.
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === "Enter" && document.activeElement === confirmRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div className="pw-confirm">
      <div className="pw-confirm__backdrop" onClick={onCancel}/>
      <div className="pw-confirm__card" role="dialog" aria-modal="true">
        <div className="pw-confirm__head">
          <span className={"pw-confirm__icon" + (destructive ? " is-destructive" : "")}>
            <Icon name={destructive ? "trash" : "bolt"} size={16}/>
          </span>
          <h3 className="pw-confirm__title">{title}</h3>
        </div>
        <div className="pw-confirm__body">{body}</div>
        <div className="pw-confirm__foot">
          <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={onCancel}>キャンセル</button>
          <button ref={confirmRef}
            className={"pw-btn pw-btn--sm " + (destructive ? "pw-btn--destructive" : "pw-btn--primary")}
            onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardScreen, ResourcesScreen, ProjectsListScreen, SettingsScreen, TaskDrawer, ResourceDrawer, ProjectDrawer, ConfirmDialog, computeWeeklyLoad });
