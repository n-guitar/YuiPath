// Gantt screen — main work surface

const ZOOM_PRESETS = {
  day:     { dayPx: 36, label: "日",   majorUnit: "month", minorUnit: "day" },
  week:    { dayPx: 14, label: "週",   majorUnit: "month", minorUnit: "week" },
  month:   { dayPx: 5,  label: "月",   majorUnit: "month", minorUnit: "week" },
  quarter: { dayPx: 2,  label: "四半期", majorUnit: "quarter", minorUnit: "month" },
};

function GanttScreen({ tweaks, onOpenTask, selectedId }) {
  const zoom = ZOOM_PRESETS[tweaks.ganttZoom] || ZOOM_PRESETS.week;
  const dayPx = zoom.dayPx;

  // Project span (pad +/-)
  const allDates = TASKS.flatMap(t => [t.start, t.end]);
  const min = allDates.reduce((a,b) => a < b ? a : b);
  const max = allDates.reduce((a,b) => a > b ? a : b);
  const startDate = parseDate(min); startDate.setDate(startDate.getDate() - 7);
  const endDate = parseDate(max); endDate.setDate(endDate.getDate() + 7);
  const totalDays = Math.round((endDate - startDate) / MS_DAY);

  const today = parseDate("2026-06-12"); // pinned for repeatable demo
  const todayX = Math.round((today - startDate) / MS_DAY) * dayPx;

  const [collapsed, setCollapsed] = React.useState({});
  const isHidden = (t) => t.parent && collapsed[t.parent];
  const visibleTasks = TASKS.filter(t => !isHidden(t));

  // Build a left list pane and right timeline. Synchronised vertical scroll via shared container.
  const xFor = (iso) => Math.round((parseDate(iso) - startDate) / MS_DAY) * dayPx;
  const wFor = (s, e) => Math.max(dayPx * 0.5, (parseDate(e) - parseDate(s))/MS_DAY * dayPx);

  const [hoverId, setHoverId] = React.useState(null);
  const focusId = selectedId || hoverId;

  return (
    <div className="pw-gantt">
      <div className="pw-gantt__toolbar">
        <div className="pw-tabs">
          <button className="pw-tab pw-tab--active">ガント</button>
          <button className="pw-tab">ボード</button>
          <button className="pw-tab">テーブル</button>
          <button className="pw-tab">カレンダー</button>
        </div>
        <div className="pw-gantt__tools">
          <button className="pw-btn pw-btn--ghost"><Icon name="filter" size={14}/> フィルター</button>
          <button className="pw-btn pw-btn--ghost"><Icon name="bolt" size={14}/> クリティカルパス</button>
          <span className="pw-divider-v" />
          <div className="pw-zoom">
            {Object.entries(ZOOM_PRESETS).map(([k,v]) => (
              <button key={k}
                className={"pw-zoom__btn" + (tweaks.ganttZoom === k ? " pw-zoom__btn--active" : "")}
                onClick={() => tweaks.setTweak("ganttZoom", k)}>{v.label}</button>
            ))}
          </div>
          <span className="pw-divider-v" />
          <button className="pw-btn pw-btn--ghost"><Icon name="download" size={14}/></button>
        </div>
      </div>

      <div className="pw-gantt__body">
        <GanttList tasks={visibleTasks} collapsed={collapsed} setCollapsed={setCollapsed} onOpenTask={onOpenTask} selectedId={selectedId} setHoverId={setHoverId} />
        <GanttTimeline
          tasks={visibleTasks}
          startDate={startDate}
          totalDays={totalDays}
          dayPx={dayPx}
          zoom={zoom}
          xFor={xFor}
          wFor={wFor}
          todayX={todayX}
          onOpenTask={onOpenTask}
          selectedId={focusId}
          setHoverId={setHoverId}
        />
      </div>

      <div className="pw-gantt__footer">
        <span><Icon name="bolt" size={12}/> クリティカルパス: <strong>11 タスク / 124 日</strong></span>
        <span>表示中: {visibleTasks.length} / {TASKS.length} タスク</span>
        <span>進捗: <strong>42%</strong></span>
        <span>SPI: <strong style={{color:"#C57F1A"}}>0.89</strong></span>
        <span>CPI: <strong style={{color:"#C57F1A"}}>0.95</strong></span>
      </div>
    </div>
  );
}

function GanttList({ tasks, collapsed, setCollapsed, onOpenTask, selectedId, setHoverId }) {
  return (
    <div className="pw-gantt__list">
      <div className="pw-gantt__list-head">
        <div className="pw-col pw-col--name">タスク</div>
        <div className="pw-col pw-col--dur">期間</div>
        <div className="pw-col pw-col--start">開始</div>
        <div className="pw-col pw-col--end">終了</div>
        <div className="pw-col pw-col--asg">担当</div>
      </div>
      <div className="pw-gantt__list-body">
        {tasks.map(t => (
          <div key={t.id}
            className={"pw-row" + (t.isPhase ? " pw-row--phase" : "") + (selectedId === t.id ? " pw-row--selected" : "") + (t.critical && !t.isPhase ? " pw-row--critical" : "")}
            onClick={() => onOpenTask(t.id)}
            onMouseEnter={() => setHoverId && setHoverId(t.id)}
            onMouseLeave={() => setHoverId && setHoverId(null)}>
            <div className="pw-col pw-col--name" style={{ paddingLeft: 12 + t.depth * 18 }}>
              {t.isPhase ? (
                <button className="pw-toggle" onClick={(e) => { e.stopPropagation(); setCollapsed({ ...collapsed, [t.id]: !collapsed[t.id] }); }}>
                  <Icon name={collapsed[t.id] ? "chevronR" : "chevronD"} size={12}/>
                </button>
              ) : <span className="pw-toggle pw-toggle--leaf">{t.milestone ? <Icon name="flagSm" size={12}/> : null}</span>}
              <span className="pw-row__name" title={t.name}>{t.name}</span>
              {t.critical && !t.isPhase && <span className="pw-tag pw-tag--critical">CP</span>}
            </div>
            <div className="pw-col pw-col--dur">{t.isPhase ? `${daysBetween(t.start, t.end)+1}d` : `${t.duration}d`}</div>
            <div className="pw-col pw-col--start">{fmtJP(t.start)}</div>
            <div className="pw-col pw-col--end">{fmtJP(t.end)}</div>
            <div className="pw-col pw-col--asg">
              {t.owner ? <PrimaryAvatar owner={t.owner} subs={t.subs} size={20} maxSubs={1} /> : <span className="pw-muted">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GanttTimeline({ tasks, startDate, totalDays, dayPx, zoom, xFor, wFor, todayX, onOpenTask, selectedId, setHoverId }) {
  const width = totalDays * dayPx;
  const rowH = 32;
  // Build header rows
  const months = [];
  let cur = new Date(startDate);
  while (cur <= addDays(startDate, totalDays - 1)) {
    const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const nextMonth = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    const segStart = monthStart < startDate ? startDate : monthStart;
    const segEnd = nextMonth > addDays(startDate, totalDays) ? addDays(startDate, totalDays) : nextMonth;
    const x = Math.round((segStart - startDate) / MS_DAY) * dayPx;
    const w = Math.round((segEnd - segStart) / MS_DAY) * dayPx;
    months.push({ x, w, label: `${monthStart.getFullYear()}年 ${monthStart.getMonth()+1}月`, short: `${monthStart.getMonth()+1}月` });
    cur = nextMonth;
  }

  // minor: weeks
  const weeks = [];
  let dd = new Date(startDate);
  let i = 0;
  while (i < totalDays) {
    const x = i * dayPx;
    const isWeekend = dd.getDay() === 0 || dd.getDay() === 6;
    const isMonday = dd.getDay() === 1;
    weeks.push({ x, isWeekend, isMonday, date: new Date(dd), dayNum: dd.getDate() });
    dd = addDays(dd, 1);
    i++;
  }

  // Lookup tasks by id for dependency arrows
  const taskMap = {};
  tasks.forEach((t, idx) => { taskMap[t.id] = { ...t, idx }; });

  return (
    <div className="pw-gantt__timeline">
      <div className="pw-gantt__tl-scroll">
        <div className="pw-gantt__tl-inner" style={{ width }}>
          {/* Header */}
          <div className="pw-gantt__tl-head" style={{ width }}>
            <div className="pw-gantt__tl-row pw-gantt__tl-row--major">
              {months.map((m, i) => (
                <div key={i} className="pw-gantt__tl-major" style={{ left: m.x, width: m.w }}>
                  {dayPx >= 8 ? m.label : m.short}
                </div>
              ))}
            </div>
            <div className="pw-gantt__tl-row pw-gantt__tl-row--minor">
              {dayPx >= 14 && weeks.map((w, i) => (
                <div key={i} className={"pw-gantt__tl-tick" + (w.isWeekend ? " pw-gantt__tl-tick--we" : "")} style={{ left: w.x, width: dayPx }}>
                  {dayPx >= 24 ? <span>{w.dayNum}</span> : (w.isMonday ? <span>{w.dayNum}</span> : null)}
                </div>
              ))}
              {dayPx < 14 && weeks.filter(w => w.isMonday).map((w, i) => (
                <div key={i} className="pw-gantt__tl-tick" style={{ left: w.x, width: dayPx*7 }}>
                  <span>{w.dayNum}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="pw-gantt__tl-body" style={{ width, height: tasks.length * rowH }}>
            {/* Grid: weekend stripes + week lines */}
            <svg className="pw-gantt__tl-grid" width={width} height={tasks.length * rowH}>
              {dayPx >= 8 && weeks.map((w, i) => w.isWeekend ? (
                <rect key={i} x={w.x} y={0} width={dayPx} height={tasks.length * rowH} fill="rgba(15,15,15,0.025)" />
              ) : null)}
              {weeks.map((w, i) => w.isMonday ? (
                <line key={"l"+i} x1={w.x} x2={w.x} y1={0} y2={tasks.length * rowH} stroke="var(--border)" strokeWidth="1" />
              ) : null)}
              {/* Row lines */}
              {tasks.map((_, i) => (
                <line key={"r"+i} x1={0} x2={width} y1={(i+1)*rowH-0.5} y2={(i+1)*rowH-0.5} stroke="var(--border-soft)" strokeWidth="1" />
              ))}
            </svg>

            {/* Today line */}
            <div className="pw-gantt__today" style={{ left: todayX, height: tasks.length * rowH }}>
              <span className="pw-gantt__today-label">今日</span>
            </div>

            {/* Dependency arrows */}
            <svg className="pw-gantt__tl-arrows" width={width} height={tasks.length * rowH}>
              <defs>
                <marker id="pw-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L6,3 L0,6 z" fill="#5C5B57" />
                </marker>
                <marker id="pw-arrow-cp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L6,3 L0,6 z" fill="var(--critical)" />
                </marker>
                <marker id="pw-arrow-focus" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L6,3 L0,6 z" fill="var(--accent)" />
                </marker>
              </defs>
              {tasks.map((t, idx) => (t.predecessors||[]).map(pid => {
                const p = taskMap[pid];
                if (!p) return null;
                // MS Project–style 3-segment Z connector: short stub from
                // pred's right edge, vertical drop to successor's center,
                // short horizontal into successor's left edge. Sharp corners.
                const barH = rowH - 12;
                const x1 = xFor(p.start) + wFor(p.start, p.end);
                const x2 = xFor(t.start);
                const y2 = idx * rowH + rowH/2;
                const goingDown = idx > p.idx;
                const y1 = p.idx * rowH + (goingDown ? rowH/2 + barH/2 - 1 : rowH/2 - barH/2 + 1);
                const cp = t.critical && p.critical;
                const isFocused = selectedId === t.id || selectedId === pid;
                const stroke = cp ? "var(--critical)" : (isFocused ? "var(--accent)" : "#5C5B57");
                const marker = cp ? "url(#pw-arrow-cp)" : (isFocused ? "url(#pw-arrow-focus)" : "url(#pw-arrow)");
                const stub = 8;
                const overlap = x2 < x1 + stub * 2;
                let d;
                if (idx === p.idx) {
                  d = `M ${x1} ${p.idx*rowH + rowH/2} L ${x2 - 3} ${y2}`;
                } else if (!overlap) {
                  // Standard 3-segment Z: short stub → vertical → short into target
                  const dropX = x1 + stub;
                  d = `M ${x1} ${y1} L ${dropX} ${y1} L ${dropX} ${y2} L ${x2 - 3} ${y2}`;
                } else {
                  // Successor starts before pred ends (lead / overlap):
                  // loop around through the row gutter behind/below pred.
                  const gutterY = goingDown
                    ? (p.idx + 1) * rowH - 2   // just inside the gap below pred
                    : p.idx * rowH + 2;        // just inside the gap above pred
                  const exitX = x1 + stub;
                  const approachX = x2 - stub;
                  d = `M ${x1} ${y1} L ${exitX} ${y1} L ${exitX} ${gutterY} L ${approachX} ${gutterY} L ${approachX} ${y2} L ${x2 - 3} ${y2}`;
                }
                return (
                  <path key={t.id+"-"+pid}
                    d={d}
                    stroke={stroke}
                    strokeWidth={cp || isFocused ? 1.2 : 1}
                    fill="none"
                    shapeRendering="crispEdges"
                    markerEnd={marker}
                    opacity={cp ? 0.9 : (isFocused ? 0.95 : 0.55)} />
                );
              }))}
            </svg>

            {/* Bars */}
            {tasks.map((t, idx) => {
              const x = xFor(t.start);
              const w = wFor(t.start, t.end);
              const y = idx * rowH + 6;
              const h = rowH - 12;
              if (t.milestone) {
                return (
                  <div key={t.id}
                    className="pw-bar pw-bar--milestone"
                    style={{ left: x - 8, top: idx*rowH + (rowH-16)/2, width:16, height:16 }}
                    onClick={() => onOpenTask(t.id)}
                    title={t.name}>
                    <div className="pw-bar__diamond"/>
                    <span className="pw-bar__label-out">{t.name}</span>
                  </div>
                );
              }
              if (t.isPhase) {
                return (
                  <div key={t.id}
                    className="pw-bar pw-bar--phase"
                    style={{ left: x, top: idx*rowH + 8, width: w, height: rowH - 16 }}
                    onClick={() => onOpenTask(t.id)}>
                    <div className="pw-bar__phase-fill" style={{ width: `${t.progress*100}%` }} />
                    <span className="pw-bar__cap pw-bar__cap--l" />
                    <span className="pw-bar__cap pw-bar__cap--r" />
                  </div>
                );
              }
              const cls = "pw-bar" + (t.critical ? " pw-bar--critical" : "") + (selectedId === t.id ? " pw-bar--selected" : "");
              return (
                <div key={t.id}
                  className={cls}
                  style={{ left: x, top: y, width: w, height: h }}
                  onClick={() => onOpenTask(t.id)}
                  onMouseEnter={() => setHoverId && setHoverId(t.id)}
                  onMouseLeave={() => setHoverId && setHoverId(null)}
                  title={`${t.name}\n${t.start} → ${t.end} (${t.duration}d)`}>
                  <div className="pw-bar__fill" style={{ width: `${t.progress*100}%` }} />
                  {w > 80 && (
                    <div className="pw-bar__inner">
                      {t.owner && <PrimaryAvatar owner={t.owner} subs={t.subs} size={16} showSubs={false} />}
                      <span className="pw-bar__name">{t.name}</span>
                      {t.progress > 0 && <span className="pw-bar__pct">{Math.round(t.progress*100)}%</span>}
                    </div>
                  )}
                  {w <= 80 && w > 36 && (
                    <div className="pw-bar__inner">
                      <span className="pw-bar__pct">{Math.round(t.progress*100)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GanttScreen });
