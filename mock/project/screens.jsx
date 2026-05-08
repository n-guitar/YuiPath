// Dashboard, WBS, Resources, Task detail drawer

// ─────────── Dashboard ───────────
function DashboardScreen({ onOpenTask }) {
  const upNext = TASKS.filter(t => !t.isPhase && t.status === "in-progress").slice(0, 4);

  return (
    <div className="pw-dash">
      {/* Compact hero — single row */}
      <div className="pw-dash__hero">
        <div className="pw-dash__hero-text">
          <div className="pw-eyebrow">プロジェクト</div>
          <h1 className="pw-h1">{PROJECT.name}</h1>
          <div className="pw-dash__meta">
            <span><Icon name="folder" size={14}/> {PROJECT.client}</span>
            <span><Icon name="calendar" size={14}/> {fmtJPLong(PROJECT.startDate)} 〜 {fmtJPLong(PROJECT.endDate)}</span>
            <HealthDot health={PROJECT_KPIS.health} />
            <span><Icon name="users" size={14}/> {RESOURCES.length} 名</span>
          </div>
        </div>
        <div className="pw-dash__hero-progress">
          <RingProgress value={PROJECT_KPIS.progress} size={92} />
          <div>
            <div className="pw-eyebrow">全体進捗</div>
            <div className="pw-dash__bigpct">{Math.round(PROJECT_KPIS.progress*100)}<span>%</span></div>
            <div className="pw-muted">残り 98 日</div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="pw-kpi-row">
        <KpiCard label="SPI スケジュール効率" value={PROJECT_KPIS.spi.toFixed(2)} sub="目標 1.00 / 計画より遅れ" intent="warn">
          <SparkLine data={[1.02, 1.00, 0.98, 0.96, 0.94, 0.91, 0.89]} color="#C57F1A" />
        </KpiCard>
        <KpiCard label="CPI コスト効率" value={PROJECT_KPIS.cpi.toFixed(2)} sub="目標 1.00 / 5% 超過" intent="warn">
          <SparkLine data={[1.01, 1.00, 0.99, 0.97, 0.96, 0.95, 0.95]} color="#C57F1A" />
        </KpiCard>
        <KpiCard label="出来高 (EV)" value={fmtMoney(PROJECT.ev)} sub={`計画値 ${fmtMoney(PROJECT.pv)}`}>
          <SparkLine data={[1, 2, 3.5, 5, 6.8, 8.4, 9.9]} color="var(--accent)" />
        </KpiCard>
        <KpiCard label="実コスト (AC)" value={fmtMoney(PROJECT.ac)} sub={`予算 ${fmtMoney(PROJECT.budget)} / 42% 消化`}>
          <SparkLine data={[0.8, 1.9, 3.6, 5.2, 7.1, 8.9, 10.4]} color="#1F1F1E" />
        </KpiCard>
      </div>

      {/* Main grid — fills remaining viewport (no scroll @ 1920x1080) */}
      <div className="pw-dash__grid">
        {/* Phases — left */}
        <div className="pw-card pw-card--phases">
          <div className="pw-card__head">
            <h3 className="pw-h3">フェーズ進捗</h3>
            <span className="pw-muted">4 フェーズ</span>
          </div>
          <div className="pw-phases">
            {TASKS.filter(t => t.isPhase).map(p => {
              const days = daysBetween(p.start, p.end) + 1;
              return (
                <div key={p.id} className="pw-phase-row">
                  <div className="pw-phase-row__head">
                    <span className="pw-phase-row__name">{p.name}</span>
                    <span className="pw-phase-row__dates">{fmtJP(p.start)} – {fmtJP(p.end)} <span className="pw-muted">· {days}d</span></span>
                    <span className="pw-phase-row__pct">{Math.round(p.progress*100)}%</span>
                  </div>
                  <Progress value={p.progress} height={6}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* EVM — center, big */}
        <div className="pw-card pw-card--evm">
          <div className="pw-card__head">
            <h3 className="pw-h3">EVM トレンド</h3>
            <div className="pw-legend">
              <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"var(--accent)"}}/>EV</span>
              <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"#1F1F1E"}}/>AC</span>
              <span className="pw-legend__item"><span className="pw-legend__sw pw-legend__sw--dash" style={{background:"#9B9B96"}}/>PV</span>
            </div>
          </div>
          <EvmChart />
        </div>

        {/* Critical path — right */}
        <div className="pw-card pw-card--cp">
          <div className="pw-card__head">
            <h3 className="pw-h3">クリティカルパス</h3>
            <span className="pw-tag pw-tag--critical">11 タスク</span>
          </div>
          <ol className="pw-cp-list">
            {TASKS.filter(t => t.critical).slice(0, 7).map((t, i) => (
              <li key={t.id} onClick={() => onOpenTask(t.id)}>
                <span className="pw-cp-list__idx">{i+1}</span>
                <span className="pw-cp-list__name">{t.name}</span>
                <span className="pw-cp-list__d">{t.duration}d</span>
              </li>
            ))}
            <li className="pw-cp-list__more"><Icon name="moreH" size={14}/> 残り 4 タスク</li>
          </ol>
        </div>

        {/* Up next — bottom-left, span 2 */}
        <div className="pw-card pw-card--upnext">
          <div className="pw-card__head">
            <h3 className="pw-h3">進行中のタスク</h3>
            <button className="pw-btn pw-btn--ghost pw-btn--sm">すべて見る <Icon name="chevronR" size={12}/></button>
          </div>
          <div className="pw-up-next">
            {upNext.map(t => (
              <button key={t.id} className="pw-up-next__row" onClick={() => onOpenTask(t.id)}>
                <div className="pw-up-next__name">
                  {t.critical && <span className="pw-tag pw-tag--critical pw-tag--sm">CP</span>}
                  {t.name}
                </div>
                <div className="pw-up-next__progress">
                  <Progress value={t.progress} height={4}/>
                  <span>{Math.round(t.progress*100)}%</span>
                </div>
                <div className="pw-up-next__date">期限 {fmtJP(t.end)}</div>
                <PrimaryAvatar owner={t.owner} subs={t.subs} size={22} maxSubs={2}/>
              </button>
            ))}
          </div>
        </div>

        {/* Activity — bottom-right */}
        <div className="pw-card pw-card--activity">
          <div className="pw-card__head">
            <h3 className="pw-h3">アクティビティ</h3>
          </div>
          <ul className="pw-activity">
            {ACTIVITY.map(a => {
              const r = RESOURCES.find(x => x.id === a.who);
              return (
                <li key={a.id}>
                  <Avatar resource={r} size={22}/>
                  <div>
                    <div className="pw-activity__text"><strong>{r.name}</strong> が{a.text}</div>
                    <div className="pw-activity__time">{a.time}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RingProgress({ value, size = 100 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value);
  return (
    <svg width={size} height={size} className="pw-ring">
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--border)" strokeWidth="8" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--accent)" strokeWidth="8" fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

function SparkLine({ data, color }) {
  const w = 120, h = 24;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length-1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p,i) => (i===0?"M":"L") + p[0] + "," + p[1]).join(" ");
  const fillD = d + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} className="pw-spark">
      <path d={fillD} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.4" fill={color} />
    </svg>
  );
}

function EvmChart() {
  const w = 720, h = 200, padX = 32, padT = 12, padB = 26;
  const months = ["4月","5月","6月","7月","8月","9月"];
  const ev = [0, 4.2, 8.5, 9.9, 9.9, 9.9];
  const ac = [0, 4.4, 9.0, 10.4, 10.4, 10.4];
  const pv = [0, 4.5, 9.5, 14.5, 19.5, 24.8];
  const max = 25;
  const xAt = i => padX + (i/(months.length-1)) * (w - padX*2);
  const yAt = v => h - padB - (v/max) * (h - padT - padB);
  const path = arr => arr.map((v,i) => (i===0?"M":"L") + xAt(i) + "," + yAt(v)).join(" ");

  return (
    <div className="pw-evm">
      <svg viewBox={`0 0 ${w} ${h}`} className="pw-evm__svg" preserveAspectRatio="none">
        {[0,5,10,15,20,25].map(v => (
          <g key={v}>
            <line x1={padX} x2={w-padX} y1={yAt(v)} y2={yAt(v)} stroke="var(--border-soft)" />
            <text x={padX-8} y={yAt(v)+4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">{v}M</text>
          </g>
        ))}
        {months.map((m,i) => (
          <text key={m} x={xAt(i)} y={h-8} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">{m}</text>
        ))}
        <path d={path(pv)} fill="none" stroke="#9B9B96" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={path(ac)} fill="none" stroke="#1F1F1E" strokeWidth="1.8" />
        <path d={path(ev) + ` L ${xAt(months.length-1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`} fill="var(--accent)" opacity="0.10" />
        <path d={path(ev)} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <line x1={xAt(2.4)} x2={xAt(2.4)} y1={padT} y2={h-padB} stroke="var(--text-tertiary)" strokeDasharray="2 3" />
        <text x={xAt(2.4)+4} y={padT+10} fontSize="10" fill="var(--text-tertiary)">今日</text>
      </svg>
    </div>
  );
}

// ─────────── WBS Tree ───────────
function WbsScreen({ onOpenTask }) {
  const phases = TASKS.filter(t => t.isPhase);
  return (
    <div className="pw-wbs">
      <div className="pw-section-head">
        <div>
          <h2 className="pw-h2">WBS / 作業分解構造</h2>
          <p className="pw-muted">プロジェクトの成果物をフェーズ → タスクに展開した階層ビュー。</p>
        </div>
        <div className="pw-section-head__tools">
          <button className="pw-btn pw-btn--ghost"><Icon name="download" size={14}/> エクスポート</button>
          <button className="pw-btn pw-btn--primary"><Icon name="plus" size={14}/> 子タスク追加</button>
        </div>
      </div>
      <div className="pw-wbs__root">
        <div className="pw-wbs-node pw-wbs-node--root">
          <div className="pw-wbs-card pw-wbs-card--root">
            <div className="pw-wbs-card__code">1.0</div>
            <div className="pw-wbs-card__title">{PROJECT.name}</div>
            <div className="pw-wbs-card__sub">{TASKS.filter(t => !t.isPhase).length} タスク · {daysBetween(PROJECT.startDate, PROJECT.endDate)} 日</div>
            <Progress value={PROJECT_KPIS.progress} height={5}/>
          </div>
        </div>
        <div className="pw-wbs__phases">
          {phases.map((p, pi) => {
            const children = TASKS.filter(t => t.parent === p.id);
            return (
              <div key={p.id} className="pw-wbs-branch">
                <div className="pw-wbs-card pw-wbs-card--phase">
                  <div className="pw-wbs-card__code">1.{pi+1}</div>
                  <div className="pw-wbs-card__title">{p.name}</div>
                  <div className="pw-wbs-card__sub">{children.length} タスク · {daysBetween(p.start, p.end)+1}d</div>
                  <Progress value={p.progress} height={5}/>
                </div>
                <div className="pw-wbs__leaves">
                  {children.map((c, ci) => (
                    <button key={c.id} className={"pw-wbs-card pw-wbs-card--leaf" + (c.critical ? " pw-wbs-card--cp" : "")} onClick={() => onOpenTask(c.id)}>
                      <div className="pw-wbs-card__code">1.{pi+1}.{ci+1}</div>
                      <div className="pw-wbs-card__title">
                        {c.milestone && <Icon name="flagSm" size={12}/>}
                        {c.name}
                        {c.critical && <span className="pw-tag pw-tag--critical pw-tag--sm">CP</span>}
                      </div>
                      <div className="pw-wbs-card__sub">{c.duration}d · {fmtJP(c.start)} – {fmtJP(c.end)}</div>
                      <div className="pw-wbs-card__foot">
                        {c.owner && <PrimaryAvatar owner={c.owner} subs={c.subs} size={18} maxSubs={2}/>}
                        <StatusPill status={c.status}/>
                      </div>
                      <Progress value={c.progress} height={4}/>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────── Resources ───────────
function ResourcesScreen({ onOpenTask }) {
  const startISO = PROJECT.startDate;
  const start = parseDate(startISO);
  const weeks = 24;
  const weekW = 32;

  const weekLoads = {};
  RESOURCES.forEach(r => { weekLoads[r.id] = new Array(weeks).fill(0); });
  TASKS.forEach(t => {
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
      // Weighted: owner takes 60%, subs share 40%
      const totalLoad = overlap / 5;
      const ownerShare = totalLoad * (t.subs && t.subs.length ? 0.6 : 1.0);
      weekLoads[t.owner][w] = (weekLoads[t.owner][w] || 0) + ownerShare;
      if (t.subs && t.subs.length) {
        const subShare = (totalLoad * 0.4) / t.subs.length;
        t.subs.forEach(rid => { weekLoads[rid][w] = (weekLoads[rid][w] || 0) + subShare; });
      }
    }
  });

  return (
    <div className="pw-res">
      <div className="pw-section-head">
        <div>
          <h2 className="pw-h2">リソース管理</h2>
          <p className="pw-muted">週次のリソースヒストグラム。100% を超えるとオーバーアロケーション。</p>
        </div>
        <div className="pw-section-head__tools">
          <span className="pw-legend">
            <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"var(--accent)"}}/>稼働率</span>
            <span className="pw-legend__item"><span className="pw-legend__sw" style={{background:"#DC4C3F"}}/>過負荷</span>
          </span>
          <button className="pw-btn pw-btn--ghost"><Icon name="filter" size={14}/> フィルター</button>
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
          {RESOURCES.map(r => {
            const loads = weekLoads[r.id];
            const peak = Math.max(...loads);
            const avg = loads.reduce((a,b)=>a+b, 0) / weeks;
            return (
              <div key={r.id} className="pw-res__row">
                <div className="pw-res__col-name">
                  <Avatar resource={r} size={32}/>
                  <div>
                    <div className="pw-res__name">{r.name}</div>
                    <div className="pw-res__role">{r.role}</div>
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
function ProjectsListScreen() {
  return (
    <div className="pw-projects">
      <div className="pw-section-head">
        <div>
          <h2 className="pw-h2">プロジェクト</h2>
          <p className="pw-muted">参加中のプロジェクト 5 件</p>
        </div>
        <div className="pw-section-head__tools">
          <button className="pw-btn pw-btn--ghost"><Icon name="upload" size={14}/> インポート (.mpp)</button>
          <button className="pw-btn pw-btn--primary"><Icon name="plus" size={14}/> 新規プロジェクト</button>
        </div>
      </div>
      <div className="pw-projects__grid">
        {PROJECTS_LIST.map(p => (
          <div key={p.id} className={"pw-proj-card" + (p.current ? " pw-proj-card--current" : "")}>
            <div className="pw-proj-card__head">
              <div className="pw-proj-card__name">{p.name}</div>
              <HealthDot health={p.health}/>
            </div>
            <div className="pw-proj-card__client">{p.client}</div>
            <div className="pw-proj-card__progress">
              <div className="pw-proj-card__pct">{Math.round(p.progress*100)}%</div>
              <Progress value={p.progress} height={5}/>
            </div>
            <div className="pw-proj-card__foot">
              <span><Icon name="users" size={14}/> {p.members} 名</span>
              <span><Icon name="calendar" size={14}/> 期限 {fmtJP(p.due)}</span>
            </div>
            {p.current && <div className="pw-proj-card__current-tag">表示中</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────── Task detail drawer ───────────
function TaskDrawer({ taskId, onClose, onEdit }) {
  const t = TASKS.find(x => x.id === taskId);
  if (!t) return null;
  const preds = (t.predecessors || []).map(id => TASKS.find(x => x.id === id)).filter(Boolean);
  const successors = TASKS.filter(x => (x.predecessors || []).includes(t.id));
  const ownerR = t.owner ? RESOURCES.find(x => x.id === t.owner) : null;
  const subsR = (t.subs || []).map(id => RESOURCES.find(x => x.id === id)).filter(Boolean);

  return (
    <>
      <div className="pw-drawer__backdrop" onClick={onClose} />
      <aside className="pw-drawer">
        <div className="pw-drawer__head">
          <div className="pw-drawer__crumb">
            {t.parent && <span>{TASKS.find(x => x.id === t.parent)?.name} <Icon name="chevronR" size={12}/> </span>}
            <span>タスク</span>
          </div>
          <div className="pw-drawer__head-tools">
            <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={onEdit}>編集</button>
            <button className="pw-icon-btn"><Icon name="link" size={16}/></button>
            <button className="pw-icon-btn"><Icon name="moreH" size={16}/></button>
            <button className="pw-icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
          </div>
        </div>

        <div className="pw-drawer__title-row">
          <button className="pw-check"><Icon name="check" size={14}/></button>
          <h2 className="pw-drawer__title">{t.name}</h2>
        </div>
        {t.critical && (
          <div className="pw-drawer__cp-banner">
            <Icon name="bolt" size={14}/> このタスクは <strong>クリティカルパス</strong> 上にあります。遅延はプロジェクト全体に影響します。
          </div>
        )}

        <div className="pw-drawer__props">
          <PropRow label="ステータス"><StatusPill status={t.status}/></PropRow>
          <PropRow label="進捗">
            <div className="pw-prop-progress">
              <Progress value={t.progress} height={6}/>
              <span>{Math.round(t.progress*100)}%</span>
            </div>
          </PropRow>
          <PropRow label="主担当">
            {ownerR ? (
              <span className="pw-chip pw-chip--owner" title={`${ownerR.name} · ${ownerR.role}`}>
                <Avatar resource={ownerR} size={20}/>
                <span className="pw-chip__name">{ownerR.name}</span>
                <span className="pw-chip__role">{ownerR.role}</span>
              </span>
            ) : <span className="pw-muted">未割当</span>}
          </PropRow>
          <PropRow label="副担当">
            {subsR.length === 0 ? <span className="pw-muted">なし</span> : (
              <div className="pw-prop-asg">
                {subsR.map(r => (
                  <span key={r.id} className="pw-chip pw-chip--sub" title={`${r.name} · ${r.role}`}>
                    <Avatar resource={r} size={16}/> {r.name}
                  </span>
                ))}
                <button className="pw-chip pw-chip--ghost"><Icon name="plus" size={12}/></button>
              </div>
            )}
          </PropRow>
          <PropRow label="開始日">{fmtJPLong(t.start)}</PropRow>
          <PropRow label="終了日">{fmtJPLong(t.end)}</PropRow>
          <PropRow label="期間">{t.duration} 営業日</PropRow>
          <PropRow label="フェーズ">
            <span className="pw-chip pw-chip--ghost">
              <span className="pw-chip__dot" style={{background:"var(--accent)"}}/>
              {TASKS.find(x => x.id === t.parent)?.name}
            </span>
          </PropRow>
          <PropRow label="先行タスク">
            {preds.length === 0 ? <span className="pw-muted">なし</span> : (
              <div className="pw-prop-deps">
                {preds.map(p => (
                  <span key={p.id} className="pw-chip pw-chip--dep">
                    <Icon name="link" size={12}/> {p.name} <span className="pw-muted">FS</span>
                  </span>
                ))}
              </div>
            )}
          </PropRow>
          <PropRow label="後続タスク">
            {successors.length === 0 ? <span className="pw-muted">なし</span> : (
              <div className="pw-prop-deps">
                {successors.map(s => (
                  <span key={s.id} className="pw-chip pw-chip--dep">
                    <Icon name="link" size={12}/> {s.name}
                  </span>
                ))}
              </div>
            )}
          </PropRow>
        </div>

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
                <span className="pw-baseline__fill pw-baseline__fill--actual" style={{ width: `${t.progress*100}%` }}/>
              </span>
              <span className="pw-baseline__val">{Math.round(t.progress*100)}% 完了</span>
            </div>
          </div>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">説明</h4>
          <p className="pw-drawer__desc">
            {t.name}に関する作業項目。受け入れ基準、関連ドキュメント、検収条件をここに記述します。
          </p>
        </div>

        <div className="pw-drawer__section">
          <h4 className="pw-h4">コメント</h4>
          <div className="pw-comment-input">
            <Avatar resource={RESOURCES[0]} size={28}/>
            <input className="pw-input pw-input--ghost" placeholder="コメントを追加…"/>
          </div>
        </div>
      </aside>
    </>
  );
}

function PropRow({ label, children }) {
  return (
    <div className="pw-prop">
      <div className="pw-prop__label">{label}</div>
      <div className="pw-prop__value">{children}</div>
    </div>
  );
}

Object.assign(window, { DashboardScreen, WbsScreen, ResourcesScreen, ProjectsListScreen, TaskDrawer });
