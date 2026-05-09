// Calendar (month) view — tasks render as bars across the days they span.
//
// Rendering:
//   - Month grid is 6 weeks (42 days) starting from the Sunday before the
//     first of the month.
//   - For each week we lay tasks into "lanes" (greedy assignment so non-
//     overlapping tasks share a row), then render each lane's tasks as
//     absolute-positioned bars.
//   - Phases are skipped; only leaf tasks appear. Milestones look like
//     1-day bars with a flag.
//
// Filters reuse the FilterDropdown component used by table / gantt.

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const CAL_LANE_HEIGHT = 22;
const CAL_LANE_GAP = 2;
const CAL_DAY_HEAD_HEIGHT = 26;

function CalendarScreen({ onOpenTask }) {
  const tasks = useTasks();
  useResources();
  useProjects();
  useCalendars();   // re-render when the calendar template changes

  const [cursorDate, setCursorDate] = React.useState(parseDate(TODAY));
  const [ownerFilter, setOwnerFilter] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState([]);

  const today = parseDate(TODAY);
  const monthLabel = `${cursorDate.getFullYear()}年 ${cursorDate.getMonth() + 1}月`;

  // Resolve the active project's calendar and build a holiday lookup
  const calendar = getCalendarFor((window.PROJECTS || []).find(x => x.current));
  const holidayMap = React.useMemo(() => {
    const m = {};
    (calendar?.holidays || []).forEach(h => { m[h.date] = h.name; });
    return m;
  }, [calendar?.id, (calendar?.holidays || []).length, cursorDate.getMonth()]);

  const filtered = React.useMemo(() => {
    const ownerSet = new Set(ownerFilter);
    const statusSet = new Set(statusFilter);
    return tasks.filter(t => {
      if (t.isPhase) return false;
      if (ownerSet.size && !ownerSet.has(t.owner) && !(t.subs || []).some(s => ownerSet.has(s))) return false;
      if (statusSet.size && !statusSet.has(t.status)) return false;
      return true;
    });
  }, [tasks, ownerFilter, statusFilter]);

  // Build the 42-day grid (6 weeks)
  const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))
  );

  const goPrev  = () => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1));
  const goNext  = () => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1));
  const goToday = () => setCursorDate(today);

  return (
    <div className="pw-cal">
      <div className="pw-view-toolbar pw-cal__toolbar">
        <div className="pw-view-toolbar__left">
          <div className="pw-cal__nav">
            <button className="pw-icon-btn" onClick={goPrev} title="前の月"><Icon name="chevronL" size={16}/></button>
            <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={goToday}>今日</button>
            <button className="pw-icon-btn" onClick={goNext} title="次の月"><Icon name="chevronR" size={16}/></button>
            <span className="pw-cal__month">{monthLabel}</span>
          </div>
          <FilterDropdown
            label="担当者"
            icon="users"
            options={(window.RESOURCES || []).map(r => ({ value: r.id, label: r.name, swatch: r.color }))}
            selected={ownerFilter}
            onChange={setOwnerFilter}/>
          <FilterDropdown
            label="ステータス"
            icon="bolt"
            options={STATUSES.map(s => ({ value: s.value, label: s.label, swatch: s.color }))}
            selected={statusFilter}
            onChange={setStatusFilter}/>
        </div>
        <div className="pw-view-toolbar__right">
          <div className="pw-cal__legend">
            {STATUSES.map(s => (
              <span key={s.value} className="pw-cal__legend-item" title={s.label}>
                <span className="pw-cal__legend-swatch" style={{ background: s.color }}/>
                {s.short}
              </span>
            ))}
            <span className="pw-divider-v"/>
            <span className="pw-cal__legend-item" title="祝日">
              <span className="pw-cal__legend-swatch pw-cal__legend-swatch--holiday"/>
              祝日
            </span>
          </div>
        </div>
      </div>

      <div className="pw-cal__weekdays">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className={"pw-cal__weekday" + (i === 0 ? " pw-cal__weekday--sun" : "") + (i === 6 ? " pw-cal__weekday--sat" : "")}>
            {d}
          </div>
        ))}
      </div>

      <div className="pw-cal__grid">
        {weeks.map((week, wi) => (
          <CalendarWeek
            key={wi}
            week={week}
            tasks={filtered}
            month={cursorDate.getMonth()}
            today={today}
            holidayMap={holidayMap}
            calendar={calendar}
            onOpenTask={onOpenTask}/>
        ))}
      </div>
    </div>
  );
}

function CalendarWeek({ week, tasks, month, today, holidayMap, calendar, onOpenTask }) {
  const weekStart = week[0];
  const weekEnd = week[6];

  // Tasks that overlap this week
  const inWeek = tasks.filter(t => {
    const ts = parseDate(t.start);
    const te = parseDate(t.end);
    return te >= weekStart && ts <= weekEnd;
  });

  // Greedy lane assignment: sort by start ascending, place in lowest free lane
  const sorted = [...inWeek].sort((a, b) => a.start < b.start ? -1 : (a.start > b.start ? 1 : 0));
  const laneEnds = []; // index = lane, value = ms timestamp of last day occupied
  const placements = sorted.map(t => {
    const ts = parseDate(t.start);
    const te = parseDate(t.end);
    const startInWeek = ts < weekStart ? weekStart : ts;
    const endInWeek = te > weekEnd ? weekEnd : te;
    let lane = laneEnds.findIndex(end => end < startInWeek.getTime());
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(endInWeek.getTime()); }
    else laneEnds[lane] = endInWeek.getTime();
    return {
      task: t,
      lane,
      startCol: Math.round((startInWeek - weekStart) / MS_DAY),
      span: Math.round((endInWeek - startInWeek) / MS_DAY) + 1,
      clipsLeft: ts < weekStart,
      clipsRight: te > weekEnd,
    };
  });

  const laneCount = Math.max(1, laneEnds.length);
  const weekHeight = CAL_DAY_HEAD_HEIGHT + laneCount * (CAL_LANE_HEIGHT + CAL_LANE_GAP) + 6;

  return (
    <div className="pw-cal__week" style={{ minHeight: weekHeight }}>
      <div className="pw-cal__week-cells">
        {week.map((d, i) => {
          const iso = fmtDate(d);
          const holidayName = holidayMap?.[iso];
          const isToday = d.getTime() === today.getTime();
          const isCurMonth = d.getMonth() === month;
          // "Weekend" = any day the calendar marks as non-working day-of-week
          const isWeekend = calendar && !calendar.workingDays[d.getDay()];
          return (
            <div key={i}
              className={"pw-cal__day"
                + (isCurMonth ? "" : " pw-cal__day--other")
                + (isToday ? " pw-cal__day--today" : "")
                + (isWeekend ? " pw-cal__day--weekend" : "")
                + (holidayName ? " pw-cal__day--holiday" : "")}
              title={holidayName || undefined}>
              <span className="pw-cal__day-num">{d.getDate()}</span>
              {holidayName && <span className="pw-cal__day-holiday">{holidayName}</span>}
            </div>
          );
        })}
      </div>
      <div className="pw-cal__week-bars" style={{ top: CAL_DAY_HEAD_HEIGHT }}>
        {placements.map(({ task, lane, startCol, span, clipsLeft, clipsRight }) => {
          const meta = STATUS_BY_VALUE[task.status] || STATUSES[0];
          const left = `calc(${startCol} * (100% / 7))`;
          const width = `calc(${span} * (100% / 7) - 4px)`;
          const top = lane * (CAL_LANE_HEIGHT + CAL_LANE_GAP);
          return (
            <button key={task.id}
              className={"pw-cal__bar"
                + (task.milestone ? " pw-cal__bar--milestone" : "")
                + (task.critical ? " pw-cal__bar--critical" : "")
                + (clipsLeft ? " pw-cal__bar--clip-l" : "")
                + (clipsRight ? " pw-cal__bar--clip-r" : "")}
              style={{
                left, width, top, height: CAL_LANE_HEIGHT,
                "--bar-color": meta.color,
              }}
              onClick={() => onOpenTask(task.id)}
              title={`${task.name}\n${task.start} → ${task.end}`}>
              {task.milestone && <Icon name="flagSm" size={11}/>}
              <span className="pw-cal__bar-name">{task.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { CalendarScreen });
