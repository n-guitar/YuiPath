// Gantt screen — main work surface

const ZOOM_PRESETS = {
  day:     { dayPx: 36, label: "日",   majorUnit: "month", minorUnit: "day" },
  week:    { dayPx: 14, label: "週",   majorUnit: "month", minorUnit: "week" },
  month:   { dayPx: 5,  label: "月",   majorUnit: "month", minorUnit: "week" },
  quarter: { dayPx: 2,  label: "四半期", majorUnit: "quarter", minorUnit: "month" },
};

function GanttScreen({ tweaks, onOpenTask, onCreateTask, selectedId }) {
  const tasks = useTasks();   // subscribed → re-renders on task mutations
  useResources();
  const zoom = ZOOM_PRESETS[tweaks.ganttZoom] || ZOOM_PRESETS.week;
  const dayPx = zoom.dayPx;
  const [cpHighlight, setCpHighlight] = React.useState(false);
  const [ownerFilter, setOwnerFilter] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState([]);

  // Project span (pad +/-). Guard against tasks=[] — reduce on an empty
  // array would throw. Fall back to the active project's span so the
  // toolbar / today marker keeps a coherent context.
  const allDates = tasks.flatMap(t => [t.start, t.end]);
  const min = allDates.length > 0 ? allDates.reduce((a,b) => a < b ? a : b) : PROJECT.startDate;
  const max = allDates.length > 0 ? allDates.reduce((a,b) => a > b ? a : b) : PROJECT.endDate;
  const startDate = parseDate(min); startDate.setDate(startDate.getDate() - 7);
  const endDate = parseDate(max); endDate.setDate(endDate.getDate() + 7);
  const totalDays = Math.round((endDate - startDate) / MS_DAY);

  const today = parseDate(TODAY);
  const todayX = Math.round((today - startDate) / MS_DAY) * dayPx;

  const [collapsed, setCollapsed] = React.useState({});
  const isHidden = (t) => t.parent && collapsed[t.parent];

  // Apply owner + status filters. Phase rows are kept only if at least one
  // of their visible leaves matches.
  const visibleTasks = React.useMemo(() => {
    const ownerSet = new Set(ownerFilter);
    const statusSet = new Set(statusFilter);
    const hasOwner = ownerSet.size > 0;
    const hasStatus = statusSet.size > 0;
    if (!hasOwner && !hasStatus) return tasks.filter(t => !isHidden(t));

    const matchesLeaf = (t) => {
      if (t.isPhase) return false;
      if (hasOwner && !ownerSet.has(t.owner) && !(t.subs || []).some(s => ownerSet.has(s))) return false;
      if (hasStatus && !statusSet.has(t.status)) return false;
      return true;
    };

    const phaseHasMatch = {};
    tasks.forEach(t => { if (matchesLeaf(t) && t.parent) phaseHasMatch[t.parent] = true; });

    return tasks.filter(t => {
      if (isHidden(t)) return false;
      if (t.isPhase) return !!phaseHasMatch[t.id];
      return matchesLeaf(t);
    });
  }, [tasks, collapsed, ownerFilter, statusFilter]);

  // Build a left list pane and right timeline. Synchronised vertical scroll via shared container.
  const xFor = (iso) => Math.round((parseDate(iso) - startDate) / MS_DAY) * dayPx;
  const wFor = (s, e) => Math.max(dayPx * 0.5, (parseDate(e) - parseDate(s))/MS_DAY * dayPx);

  const [hoverId, setHoverId] = React.useState(null);
  const focusId = selectedId || hoverId;

  return (
    <div className="pw-gantt">
      <div className="pw-view-toolbar pw-gantt__toolbar">
        <div className="pw-view-toolbar__left">
          <FilterDropdown
            label="担当者"
            icon="users"
            options={(window.RESOURCES || []).map(r => ({
              value: r.id, label: r.name, swatch: r.color,
            }))}
            selected={ownerFilter}
            onChange={setOwnerFilter}/>
          <FilterDropdown
            label="ステータス"
            icon="bolt"
            options={STATUSES.map(s => ({
              value: s.value, label: s.label, swatch: s.color,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}/>
          <button
            className={"pw-btn pw-btn--ghost pw-btn--sm pw-btn--toggle" + (cpHighlight ? " is-on" : "")}
            onClick={() => setCpHighlight(v => !v)}
            title="クリティカルパスを強調表示">
            <Icon name="bolt" size={14}/> CP
          </button>
        </div>
        <div className="pw-view-toolbar__right">
          <div className="pw-zoom">
            {Object.entries(ZOOM_PRESETS).map(([k,v]) => (
              <button key={k}
                className={"pw-zoom__btn" + (tweaks.ganttZoom === k ? " pw-zoom__btn--active" : "")}
                onClick={() => tweaks.setTweak("ganttZoom", k)}>{v.label}</button>
            ))}
          </div>
          <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateTask}>
            <Icon name="plus" size={14}/> 新規タスク
          </button>
        </div>
      </div>

      <div className="pw-gantt__body">
        {tasks.length === 0 ? (
          <div className="pw-gantt__empty">
            <div className="pw-empty pw-empty--onboarding">
              <YuiPathMark size={56}/>
              <div className="pw-empty__title">タスクがまだありません</div>
              <div className="pw-empty__sub">最初のタスクを作成すると、ここにバーが並びます。</div>
              <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateTask}>
                <Icon name="plus" size={14}/> 最初のタスクを追加
              </button>
            </div>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="pw-gantt__empty">
            <div className="pw-empty">
              <Icon name="search" size={28}/>
              <div className="pw-empty__title">該当するタスクがありません</div>
              <div className="pw-empty__sub">フィルタを変更するか、解除して再表示できます</div>
              {(ownerFilter.length || statusFilter.length) > 0 && (
                <button className="pw-btn pw-btn--ghost pw-btn--sm"
                  onClick={() => { setOwnerFilter([]); setStatusFilter([]); }}>
                  <Icon name="close" size={12}/> フィルタを解除
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="pw-gantt__footer">
        <div className="pw-gantt__legend">
          {STATUSES.map(s => (
            <span key={s.value} className="pw-gantt__legend-item" title={s.label}>
              <span className="pw-gantt__legend-swatch" style={{ background: s.color }}/>
              {s.short}
            </span>
          ))}
          <span className="pw-gantt__legend-item pw-gantt__legend-item--cp" title="クリティカルパス">
            <span className="pw-gantt__legend-swatch pw-gantt__legend-swatch--cp"/>
            CP
          </span>
        </div>
        <div className="pw-gantt__footer-stats">
          <span>表示中: {visibleTasks.length} / {tasks.length}</span>
          <span>進捗: <strong>{computeOverallProgress(tasks)}%</strong></span>
        </div>
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
        {tasks.map(t => {
          const nextMs = t.isPhase ? nextMilestoneFor(t.id, window.TASKS || [], TODAY) : null;
          return (
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
              {nextMs && (
                <button
                  className="pw-next-ms"
                  onClick={(e) => { e.stopPropagation(); onOpenTask(nextMs.id); }}
                  title={`次のマイルストーン: ${nextMs.name} (${fmtJP(nextMs.end)})`}>
                  <Icon name="flagSm" size={11}/>
                  <span className="pw-next-ms__name">{nextMs.name}</span>
                  <span className="pw-next-ms__date">{fmtJP(nextMs.end)}</span>
                </button>
              )}
            </div>
            <div className="pw-col pw-col--dur">{t.isPhase ? `${daysBetween(t.start, t.end)+1}d` : `${t.duration}d`}</div>
            <div className="pw-col pw-col--start">{fmtJP(t.start)}</div>
            <div className="pw-col pw-col--end">{fmtJP(t.end)}</div>
            <div className="pw-col pw-col--asg">
              {t.owner ? <PrimaryAvatar owner={t.owner} subs={t.subs} size={20} maxSubs={1} /> : <span className="pw-muted">—</span>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function GanttTimeline({ tasks, startDate, totalDays, dayPx, zoom, xFor, wFor, todayX, onOpenTask, selectedId, setHoverId }) {
  const width = totalDays * dayPx;
  const rowH = 32;

  // ─── Bar drag (move / resize-l / resize-r) ───
  // Drag commits straight to the task store; the bar repositions on the
  // next render. We capture origStart/origEnd at pointerdown so the
  // delta math is always relative to the click origin (no drift).
  const dragRef = React.useRef(null);
  const [dragId, setDragId] = React.useState(null);
  const calendar = getCalendarFor((window.PROJECTS || []).find(p => p.current));

  const beginDrag = (e, task, mode) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (task.isPhase) return;
    if (task.milestone && mode !== "move") return;
    e.stopPropagation();
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) {}
    dragRef.current = {
      id: task.id, mode,
      origStart: task.start, origEnd: task.end,
      startX: e.clientX,
      moved: false,
      pointerId: e.pointerId,
      target: e.currentTarget,
    };
    setDragId(task.id);
    document.body.classList.add(mode === "move" ? "pw-dragging-move" : "pw-dragging-resize");
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const days = Math.round((e.clientX - d.startX) / dayPx);
    if (days === 0 && !d.moved) return;
    if (Math.abs(e.clientX - d.startX) < 3 && !d.moved) return;
    d.moved = true;

    if (d.mode === "move") {
      const newStart = fmtDate(addDays(parseDate(d.origStart), days));
      const newEnd   = fmtDate(addDays(parseDate(d.origEnd),   days));
      updateTask(d.id, { start: newStart, end: newEnd });
    } else if (d.mode === "resize-l") {
      let newStart = fmtDate(addDays(parseDate(d.origStart), days));
      // Don't allow start to pass end — clamp to one day before end.
      if (parseDate(newStart) > parseDate(d.origEnd)) {
        newStart = d.origEnd;
      }
      const dur = Math.max(1, workingDaysBetween(newStart, d.origEnd, calendar));
      updateTask(d.id, { start: newStart, duration: dur });
    } else if (d.mode === "resize-r") {
      let newEnd = fmtDate(addDays(parseDate(d.origEnd), days));
      if (parseDate(newEnd) < parseDate(d.origStart)) {
        newEnd = d.origStart;
      }
      const dur = Math.max(1, workingDaysBetween(d.origStart, newEnd, calendar));
      updateTask(d.id, { end: newEnd, duration: dur });
    }
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    try { d.target?.releasePointerCapture?.(d.pointerId); } catch (_) {}
    document.body.classList.remove("pw-dragging-move", "pw-dragging-resize");
    const wasMoved = d.moved;
    dragRef.current = null;
    setDragId(null);
    // Suppress the click that follows a real drag (browsers may still fire
    // it after pointercapture release). For pure clicks, the bar's onClick
    // handler will fire normally and we don't interfere.
    if (wasMoved && e.currentTarget) {
      const stop = (ev) => { ev.stopPropagation(); };
      e.currentTarget.addEventListener("click", stop, { once: true, capture: true });
    }
  };
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
                    className={"pw-bar pw-bar--milestone" + (dragId === t.id ? " pw-bar--dragging" : "")}
                    style={{ left: x - 8, top: idx*rowH + (rowH-16)/2, width:16, height:16 }}
                    onPointerDown={(e) => beginDrag(e, t, "move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
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
              const meta = STATUS_BY_VALUE[t.status] || STATUSES[0];
              const cls = "pw-bar pw-bar--status pw-bar--draggable"
                + (t.critical ? " pw-bar--critical" : "")
                + (selectedId === t.id ? " pw-bar--selected" : "")
                + (t.status === "blocked" ? " pw-bar--blocked" : "")
                + (dragId === t.id ? " pw-bar--dragging" : "");
              return (
                <div key={t.id}
                  className={cls}
                  style={{ left: x, top: y, width: w, height: h, "--bar-color": meta.color }}
                  onPointerDown={(e) => beginDrag(e, t, "move")}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => onOpenTask(t.id)}
                  onMouseEnter={() => setHoverId && setHoverId(t.id)}
                  onMouseLeave={() => setHoverId && setHoverId(null)}
                  title={`${t.name}\n${meta.label} · ${t.start} → ${t.end} (${t.duration}d)`}>
                  <div className="pw-bar__fill" style={{ width: `${t.progress*100}%` }} />
                  {/* Resize handles — invisible 6px slabs at each edge.
                      pointerdown here is "resize"; stopPropagation prevents
                      the body's "move" handler from also firing. */}
                  <div className="pw-bar__handle pw-bar__handle--l"
                    onPointerDown={(e) => beginDrag(e, t, "resize-l")}/>
                  <div className="pw-bar__handle pw-bar__handle--r"
                    onPointerDown={(e) => beginDrag(e, t, "resize-r")}/>
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
