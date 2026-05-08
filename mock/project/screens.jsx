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
function DashboardScreen({ onOpenTask, onOpenResource }) {
  useTasks();
  useResources();

  const tasks = window.TASKS || [];
  const resources = window.RESOURCES || [];
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
// owner: 60% if there are subs, else 100%; subs share the remaining 40%.
function computeWeeklyLoad(weeks = 24, startDate = PROJECT.startDate) {
  const start = parseDate(startDate);
  const tasks = window.TASKS || [];
  const resources = window.RESOURCES || [];
  const out = {};
  resources.forEach(r => { out[r.id] = new Array(weeks).fill(0); });
  tasks.forEach(t => {
    if (t.isPhase || !t.owner) return;
    const involved = allAssignees(t);
    if (involved.length === 0) return;
    const ts = parseDate(t.start);
    const te = parseDate(t.end);
    for (let w = 0; w < weeks; w++) {
      const wStart = addDays(start, w*7);
      const wEnd = addDays(start, w*7+7);
      if (te < wStart || ts > wEnd) continue;
      const a = ts > wStart ? ts : wStart;
      const b = te < wEnd ? te : wEnd;
      const overlap = Math.max(0, (b - a) / MS_DAY);
      const totalLoad = overlap / 5;
      const ownerShare = totalLoad * (t.subs && t.subs.length ? 0.6 : 1.0);
      if (out[t.owner]) out[t.owner][w] += ownerShare;
      if (t.subs && t.subs.length) {
        const subShare = (totalLoad * 0.4) / t.subs.length;
        t.subs.forEach(rid => { if (out[rid]) out[rid][w] += subShare; });
      }
    }
  });
  return out;
}

// ─────────── Resources ───────────
function ResourcesScreen({ onOpenTask, onOpenResource, onCreateResource }) {
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
            <div className="pw-empty pw-empty--inline">
              <Icon name="users" size={28}/>
              <div className="pw-empty__title">メンバーがいません</div>
              <div className="pw-empty__sub">「+ メンバー追加」から最初のメンバーを登録してください</div>
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
          <button className="pw-btn pw-btn--ghost pw-btn--sm"><Icon name="upload" size={14}/> インポート (.mpp)</button>
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

  // Date change recomputes duration. If the new value would invert the range
  // (end < start), auto-snap the other endpoint so duration stays >= 0.
  const setDate = (key, val) => {
    const p = { [key]: val };
    const next = { ...t, ...p };
    if (next.start && next.end && parseDate(next.start) > parseDate(next.end)) {
      if (key === "start") p.end = val;     // pulled end up to match
      else p.start = val;                    // pushed start down to match
    }
    const recomputed = { ...t, ...p };
    if (recomputed.start && recomputed.end) {
      p.duration = Math.max(0, daysBetween(recomputed.start, recomputed.end));
    }
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
                  onChange={(e) => patch({ duration: Number(e.target.value) })}/>
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
            {onDelete && (
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
          <h4 className="pw-h4">週次負荷（24週）</h4>
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

function ProjectDrawer({ projectId, onClose, onDelete, onSwitchTo }) {
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

Object.assign(window, { DashboardScreen, ResourcesScreen, ProjectsListScreen, TaskDrawer, ResourceDrawer, ProjectDrawer, ConfirmDialog, computeWeeklyLoad });
