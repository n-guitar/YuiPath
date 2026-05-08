// Reusable form pickers shared across drawers.
//
// Originally these lived in task-modal.jsx alongside a now-removed TaskModal.
// They're kept independently because the inline-editable drawers (TaskDrawer,
// ProjectDrawer) reuse them.

// Single-select person (used as task owner picker).
function PersonPicker({ value, onChange, exclude = [] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const r = value ? RESOURCES.find(x => x.id === value) : null;
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div className="pw-picker" ref={ref}>
      <button type="button" className={"pw-picker__trigger" + (open ? " is-open" : "")} onClick={() => setOpen(o => !o)}>
        {r ? (
          <>
            <Avatar resource={r} size={20}/>
            <span className="pw-picker__name">{r.name}</span>
            <span className="pw-picker__role">{r.role}</span>
          </>
        ) : <span className="pw-muted">担当者を選択…</span>}
        <Icon name="chevronD" size={14}/>
      </button>
      {open && (
        <div className="pw-picker__menu">
          {value && (
            <button type="button" className="pw-picker__item pw-picker__clear" onClick={() => { onChange(""); setOpen(false); }}>
              <span className="pw-muted">未割当にする</span>
            </button>
          )}
          {RESOURCES.filter(x => !exclude.includes(x.id)).map(x => (
            <button key={x.id} type="button" className={"pw-picker__item" + (value === x.id ? " is-selected" : "")}
              onClick={() => { onChange(x.id); setOpen(false); }}>
              <Avatar resource={x} size={20}/>
              <span className="pw-picker__name">{x.name}</span>
              <span className="pw-picker__role">{x.role}</span>
              {value === x.id && <Icon name="check" size={14}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Multi-select people (used as sub-assignees picker).
function PeoplePicker({ values, onChange, exclude = [] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const toggle = (id) => onChange(values.includes(id) ? values.filter(x => x !== id) : [...values, id]);
  const selected = values.map(id => RESOURCES.find(x => x.id === id)).filter(Boolean);
  return (
    <div className="pw-picker" ref={ref}>
      <div className={"pw-picker__chips" + (open ? " is-open" : "")} onClick={() => setOpen(true)}>
        {selected.length === 0 && <span className="pw-muted">副担当を追加…</span>}
        {selected.map(s => (
          <span key={s.id} className="pw-chip pw-chip--sub">
            <Avatar resource={s} size={16}/> {s.name}
            <button type="button" className="pw-chip__x" onClick={(e) => { e.stopPropagation(); toggle(s.id); }} aria-label="削除">
              <Icon name="close" size={10}/>
            </button>
          </span>
        ))}
        <button type="button" className="pw-picker__add" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
          <Icon name="plus" size={12}/>
        </button>
      </div>
      {open && (
        <div className="pw-picker__menu">
          {RESOURCES.filter(x => !exclude.includes(x.id)).map(x => {
            const on = values.includes(x.id);
            return (
              <button key={x.id} type="button" className={"pw-picker__item" + (on ? " is-selected" : "")} onClick={() => toggle(x.id)}>
                <span className={"pw-checkbox" + (on ? " is-on" : "")}>{on && <Icon name="check" size={10}/>}</span>
                <Avatar resource={x} size={20}/>
                <span className="pw-picker__name">{x.name}</span>
                <span className="pw-picker__role">{x.role}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Predecessor multi-select with task search.
function PredecessorPicker({ values, onChange, tasks, onOpenTask }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const toggle = (id) => onChange(values.includes(id) ? values.filter(x => x !== id) : [...values, id]);
  const selected = values.map(id => tasks.find(x => x.id === id) || TASKS.find(x => x.id === id)).filter(Boolean);
  const filtered = tasks.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pw-picker pw-picker--deps" ref={ref}>
      <div className="pw-picker__deps">
        {selected.length === 0 && (
          <span className="pw-muted pw-picker__empty">先行タスクなし — 開始日になり次第、独立して開始できます</span>
        )}
        {selected.map(t => (
          <span key={t.id} className="pw-chip pw-chip--dep">
            <Icon name="link" size={12}/>
            <button type="button" className="pw-chip__link" onClick={() => onOpenTask && onOpenTask(t.id)}>
              {t.name}
            </button>
            <span className="pw-chip__suffix">FS</span>
            <button type="button" className="pw-chip__x" onClick={() => toggle(t.id)} aria-label="削除">
              <Icon name="close" size={10}/>
            </button>
          </span>
        ))}
        <button type="button" className="pw-picker__add pw-picker__add--lg" onClick={() => setOpen(o => !o)}>
          <Icon name="plus" size={12}/> 先行タスクを追加
        </button>
      </div>
      {open && (
        <div className="pw-picker__menu pw-picker__menu--deps">
          <div className="pw-picker__search">
            <Icon name="search" size={14}/>
            <input className="pw-input pw-input--ghost" placeholder="タスク名で検索…" value={q} onChange={e => setQ(e.target.value)} autoFocus/>
          </div>
          <div className="pw-picker__list">
            {filtered.map(t => {
              const on = values.includes(t.id);
              const phase = TASKS.find(x => x.id === t.parent);
              return (
                <button key={t.id} type="button" className={"pw-picker__item pw-picker__item--task" + (on ? " is-selected" : "")} onClick={() => toggle(t.id)}>
                  <span className={"pw-checkbox" + (on ? " is-on" : "")}>{on && <Icon name="check" size={10}/>}</span>
                  <span className="pw-picker__task">
                    <span className="pw-picker__task-name">{t.name}</span>
                    <span className="pw-picker__task-meta">
                      <span className="pw-chip__dot" style={{ background: "var(--accent)" }}/>
                      {phase?.name} · {fmtJP(t.start)}–{fmtJP(t.end)}
                    </span>
                  </span>
                  {t.critical && <span className="pw-tag pw-tag--critical pw-tag--sm">CP</span>}
                </button>
              );
            })}
            {filtered.length === 0 && <div className="pw-picker__empty pw-muted">該当するタスクがありません</div>}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PersonPicker, PeoplePicker, PredecessorPicker });
