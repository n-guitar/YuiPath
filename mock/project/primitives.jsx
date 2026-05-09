// Date utilities and shared primitives for YuiPath

const MS_DAY = 86400000;
const parseDate = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const fmtDate = (d) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; };
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / MS_DAY);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const fmtJP = (s) => { const d = parseDate(s); return `${d.getMonth()+1}/${d.getDate()}`; };
const fmtJPLong = (s) => { const d = parseDate(s); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; };
const fmtMoney = (n) => "¥" + n.toLocaleString("ja-JP");

// ─────────── Working-day arithmetic ───────────
// All helpers accept either:
//   - a `calendar` object: { workingDays: [bool×7 Sun..Sat], holidays: [{date, name}] }
//   - a legacy holidays array: [{date,name}] or [ISOstrings] (assumes Mon-Fri working)
//   - undefined: defaults to Mon-Fri, no holidays

function _resolveCalendar(arg) {
  if (!arg) {
    return { workingDays: [false, true, true, true, true, true, false], holidaySet: new Set() };
  }
  if (Array.isArray(arg)) {
    // legacy: holidays array, default Mon-Fri
    return {
      workingDays: [false, true, true, true, true, true, false],
      holidaySet: new Set(arg.map(h => (typeof h === "string" ? h : h.date))),
    };
  }
  // calendar object
  return {
    workingDays: arg.workingDays || [false, true, true, true, true, true, false],
    holidaySet: new Set((arg.holidays || []).map(h => h.date)),
  };
}

function isWorkingDay(date, calendar) {
  const c = _resolveCalendar(calendar);
  if (!c.workingDays[date.getDay()]) return false;
  return !c.holidaySet.has(fmtDate(date));
}

// Inclusive count: workingDaysBetween("Mon", "Fri") = 5 (Mon-Fri standard).
// Returns 0 if end < start.
function workingDaysBetween(startIso, endIso, calendar) {
  if (!startIso || !endIso) return 0;
  const s = parseDate(startIso);
  const e = parseDate(endIso);
  if (s > e) return 0;
  const c = _resolveCalendar(calendar);
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    if (isWorkingDay(d, c)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Advances `n` working days from start. n=0 returns start unchanged.
// So `end = addWorkingDays(start, duration - 1)` when duration counts both endpoints.
function addWorkingDays(startIso, n, calendar) {
  const d = parseDate(startIso);
  if (n <= 0) return fmtDate(d);
  const c = _resolveCalendar(calendar);
  let advanced = 0;
  while (advanced < n) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, c)) advanced++;
  }
  return fmtDate(d);
}

// Returns the "next milestone" task for a given phase id, given a task list
// and a `today` ISO date. Picks the soonest upcoming milestone (end >= today);
// falls back to the latest past milestone if none are upcoming. Returns null
// when the phase has no milestones.
function nextMilestoneFor(phaseId, tasks, todayIso) {
  const today = parseDate(todayIso);
  const within = (tasks || []).filter(t => t.parent === phaseId && t.milestone);
  if (within.length === 0) return null;
  const upcoming = within
    .filter(m => parseDate(m.end) >= today)
    .sort((a, b) => a.end < b.end ? -1 : 1);
  if (upcoming.length > 0) return upcoming[0];
  const sorted = [...within].sort((a, b) => a.end < b.end ? -1 : 1);
  return sorted[sorted.length - 1];
}

// Weighted progress across leaf tasks, weighted by working-day duration.
// Phases are excluded — their progress would double-count their children.
function computeOverallProgress(tasks) {
  const leaves = (tasks || []).filter(t => !t.isPhase);
  if (leaves.length === 0) return 0;
  let totalW = 0, doneW = 0;
  leaves.forEach(t => {
    const w = Math.max(1, t.duration || 1);
    totalW += w;
    doneW += w * (t.progress || 0);
  });
  if (totalW === 0) return 0;
  return Math.round((doneW / totalW) * 100);
}

// Relative time for comments / activity. Pinned to NOW for repeatable mock.
function fmtRelativeTime(iso, nowIso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = new Date(nowIso || (typeof NOW !== "undefined" ? NOW : new Date().toISOString())).getTime();
  const diffSec = Math.max(0, (now - t) / 1000);
  if (diffSec < 60) return "たった今";
  if (diffSec < 3600) return `${Math.floor(diffSec/60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec/3600)}時間前`;
  if (diffSec < 86400*7) return `${Math.floor(diffSec/86400)}日前`;
  // For older entries, fall back to absolute date
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

// ─── YuiPath brand assets ───
// Smile mark (3-bar Gantt face). Static for the topbar/auth, animated for
// the About hero. Loaded as <img>; pure shapes so no font dependency.
function YuiPathMark({ size = 28, animated = false, className = "" }) {
  const src = animated ? "assets/yuipath-smile-animated.svg" : "assets/yuipath-smile-static.svg";
  return <img src={src} width={size} height={size} alt="YuiPath" className={"pw-yp-mark " + className}/>;
}

// "YuiPath" wordmark. Inlined SVG (not <img>) so the document-loaded Nunito
// is reachable — <img>-loaded SVGs are sandboxed from external fonts.
// "Yui" inherits currentColor (so it follows the surrounding text color
// and adapts to light/dark themes); "Path" stays the brand blue.
//
// viewBox is tightened to fit the actual letter glyphs (Nunito 800 caps run
// roughly y=22..62, no descenders in "YuiPath"). The original SVG used
// viewBox="0 0 220 80" with ~30 units of vertical whitespace, which made
// the rendered text feel small even at substantial heights.
function YuiPathWordmark({ height = 28, color = "currentColor", accent = "#3B82F6" }) {
  // Cropped viewBox: 0 22 178 42  (aspect ~4.24 : 1)
  const width = Math.round(height * 178 / 42);
  return (
    <svg
      width={width} height={height}
      viewBox="0 22 178 42" fill="none"
      role="img" aria-label="YuiPath"
      className="pw-yp-wordmark">
      <text
        x="0" y="60"
        fill={color}
        style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 48 }}>
        Yui<tspan fill={accent}>Path</tspan>
      </text>
    </svg>
  );
}

// Avatar bubble
function Avatar({ resource, size = 24, ring = false }) {
  if (!resource) return null;
  const initial = resource.name.charAt(0);
  return (
    <span
      className="pw-avatar"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.45),
        background: resource.color,
        boxShadow: ring ? "0 0 0 2px var(--surface)" : "none",
      }}
      title={`${resource.name} · ${resource.role}`}
    >{initial}</span>
  );
}

function AvatarStack({ ids, max = 3, size = 22 }) {
  const arr = ids.map(id => RESOURCES.find(r => r.id === id)).filter(Boolean);
  const shown = arr.slice(0, max);
  const overflow = arr.length - shown.length;
  return (
    <span className="pw-avatar-stack" style={{ "--size": size + "px" }}>
      {shown.map((r,i) => <Avatar key={r.id} resource={r} size={size} ring />)}
      {overflow > 0 && (
        <span className="pw-avatar pw-avatar--more" style={{ width: size, height: size, fontSize: Math.round(size*0.42) }}>+{overflow}</span>
      )}
    </span>
  );
}

// Primary + sub assignees: owner shown prominently, subs smaller next to it
function PrimaryAvatar({ owner, subs = [], size = 22, showSubs = true, maxSubs = 2 }) {
  const ownerR = RESOURCES.find(r => r.id === owner);
  if (!ownerR) return null;
  const subsR = (subs || []).map(id => RESOURCES.find(r => r.id === id)).filter(Boolean);
  const shown = subsR.slice(0, maxSubs);
  const rest = subsR.length - shown.length;
  const subSize = Math.max(12, Math.round(size * 0.72));
  return (
    <span className="pw-passign" title={`主担当: ${ownerR.name}${subsR.length ? ` / 副担当: ${subsR.map(s=>s.name).join("、")}` : ""}`}>
      <span className="pw-passign__owner">
        <Avatar resource={ownerR} size={size} />
        <span className="pw-passign__crown" aria-hidden="true" />
      </span>
      {showSubs && shown.length > 0 && (
        <span className="pw-passign__subs">
          {shown.map(s => <Avatar key={s.id} resource={s} size={subSize} />)}
          {rest > 0 && (
            <span className="pw-avatar pw-avatar--more" style={{ width: subSize, height: subSize, fontSize: Math.round(subSize*0.45) }}>+{rest}</span>
          )}
        </span>
      )}
    </span>
  );
}

function StatusPill({ status, compact }) {
  const s = STATUS_BY_VALUE[status] || STATUSES[0];
  return (
    <span className="pw-pill pw-pill--status-chip" style={{ "--pill-color": s.color }}>
      <span className="pw-pill__dot" style={{ background: s.color }}/>
      {compact ? s.short : s.label}
    </span>
  );
}

function HealthDot({ health }) {
  const map = {
    "on-track":  { color: "#2A8C6E", label: "順調" },
    "at-risk":   { color: "#C57F1A", label: "注意" },
    "off-track": { color: "#DC4C3F", label: "遅延" },
  };
  const cfg = map[health];
  return (
    <span className="pw-health-dot">
      <span className="pw-health-dot__dot" style={{ background: cfg.color }} />
      <span>{cfg.label}</span>
    </span>
  );
}

// Tiny inline icons (lucide-style strokes)
function Icon({ name, size = 16, className }) {
  const paths = {
    home:        <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
    gantt:       <><path d="M3 5h10" /><path d="M7 10h12" /><path d="M5 15h9" /><path d="M9 20h11" /></>,
    users:<><circle cx="9" cy="8" r="3" /><path d="M3 20c1-3 3-5 6-5s5 2 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M14 20c.6-2 2-3 3.5-3s2.5.8 3.5 3" /></>,
    folder:      <><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    settings:    <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    search:      <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    plus:        <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    chevronR:    <><path d="M9 6l6 6-6 6" /></>,
    chevronD:    <><path d="M6 9l6 6 6-6" /></>,
    chevronL:    <><path d="M15 6l-6 6 6 6" /></>,
    close:       <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    sparkle:     <><path d="M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8z" /><path d="M19 15l.8 2 2 .8-2 .8L19 21l-.8-2-2-.8 2-.8z" /></>,
    flag:        <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
    calendar:    <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
    filter:      <><path d="M4 5h16l-6 8v6l-4-2v-4z" /></>,
    download:    <><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
    upload:      <><path d="M12 20V8" /><path d="M7 13l5-5 5 5" /><path d="M4 4h16" /></>,
    bell:        <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    sidebar:     <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    moreH:       <><circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18" cy="12" r="1.4" /></>,
    link:        <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
    bolt:        <><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></>,
    check:       <><path d="M5 12l4 4 10-10" /></>,
    flagSm:      <><path d="M4 21V4" /><path d="M4 4h12l-2 3 2 3H4" /></>,
    file:        <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
    table:       <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M3 14h18" /><path d="M9 4v16" /></>,
    trash:       <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
    indent:      <><path d="M4 6h16" /><path d="M10 12h10" /><path d="M4 18h16" /><path d="M4 9l3 3-3 3" /></>,
    outdent:     <><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h16" /><path d="M20 9l-3 3 3 3" /></>,
    copy:        <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    insert:      <><path d="M12 4v16" /><path d="M4 12h16" /><circle cx="12" cy="12" r="9" opacity="0.4" /></>,
    panelR:      <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d="M18 9l2 3-2 3" /></>,
    edit:        <><path d="M14 4l6 6-12 12H2v-6z" /><path d="M12 6l6 6" /></>,
    globe:       <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></>,
    info:        <><circle cx="12" cy="12" r="9" /><path d="M12 8h0" /><path d="M11 12h1v5h1" /></>,
    sun:         <><circle cx="12" cy="12" r="4" /><path d="M12 3v2" /><path d="M12 19v2" /><path d="M3 12h2" /><path d="M19 12h2" /><path d="M5.6 5.6l1.4 1.4" /><path d="M17 17l1.4 1.4" /><path d="M5.6 18.4l1.4-1.4" /><path d="M17 7l1.4-1.4" /></>,
    moon:        <><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></>,
  };
  return (
    <svg className={"pw-icon " + (className||"")} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
}

// Mini progress bar
function Progress({ value, height = 4, color }) {
  return (
    <span className="pw-progress" style={{ height }}>
      <span className="pw-progress__fill" style={{ width: `${Math.round(value*100)}%`, background: color || "var(--accent)" }} />
    </span>
  );
}

// ─────────── FilterDropdown ───────────
// Generic multi-select filter button. `selected` is an array; `options` is
// `[{ value, label, swatch?, icon? }]`. The trigger shows a count badge when
// any options are selected, and the popover supports a "解除" clear action.
function FilterDropdown({ label, icon, options, selected, onChange, placeholder = "すべて" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (v) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  const clear = () => onChange([]);

  const hasFilter = selected.length > 0;
  const summary = !hasFilter ? placeholder
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? "1件")
    : `${selected.length}件`;

  return (
    <div className="pw-filter" ref={ref}>
      <button
        className={"pw-btn pw-btn--ghost pw-btn--sm pw-filter__trigger" + (hasFilter ? " is-active" : "")}
        onClick={() => setOpen(o => !o)}>
        {icon && <Icon name={icon} size={14}/>}
        <span className="pw-filter__label">{label}</span>
        <span className="pw-filter__summary">{summary}</span>
        <Icon name="chevronD" size={10}/>
      </button>
      {open && (
        <div className="pw-filter__menu">
          {hasFilter && (
            <button className="pw-filter__clear" onClick={clear}>
              <Icon name="close" size={11}/> 解除
            </button>
          )}
          <div className="pw-filter__list">
            {options.map(opt => {
              const on = selected.includes(opt.value);
              return (
                <button key={opt.value}
                  type="button"
                  className={"pw-filter__item" + (on ? " is-selected" : "")}
                  onClick={() => toggle(opt.value)}>
                  <span className={"pw-checkbox" + (on ? " is-on" : "")}>
                    {on && <Icon name="check" size={9}/>}
                  </span>
                  {opt.swatch && <span className="pw-filter__swatch" style={{ background: opt.swatch }}/>}
                  {opt.avatar}
                  <span className="pw-filter__item-label">{opt.label}</span>
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="pw-filter__empty">候補がありません</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  parseDate, fmtDate, daysBetween, addDays, fmtJP, fmtJPLong, fmtMoney, fmtRelativeTime, MS_DAY,
  isWorkingDay, workingDaysBetween, addWorkingDays,
  nextMilestoneFor, computeOverallProgress,
  YuiPathMark, YuiPathWordmark,
  Avatar, AvatarStack, PrimaryAvatar, StatusPill, HealthDot, Icon, Progress, FilterDropdown,
});
