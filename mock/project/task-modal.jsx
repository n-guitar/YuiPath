// Task create / edit modal — primary surface for managing tasks.
// Mock: no real persistence; closes on save (would dispatch in a real app).

function TaskModal({ mode, task, onClose, onOpenTask }) {
  const isEdit = mode === "edit";
  const phases = TASKS.filter(t => t.isPhase);
  const allLeafTasks = TASKS.filter(t => !t.isPhase);

  const initial = React.useMemo(() => {
    if (isEdit && task) {
      return {
        name: task.name,
        parent: task.parent || phases[0]?.id,
        start: task.start,
        end: task.end,
        duration: task.duration || 1,
        owner: task.owner || "",
        subs: task.subs || [],
        predecessors: task.predecessors || [],
        status: task.status || "todo",
        progress: task.progress || 0,
        milestone: !!task.milestone,
        description: "",
      };
    }
    return {
      name: "",
      parent: phases[0]?.id,
      start: "2026-06-01",
      end:   "2026-06-05",
      duration: 5,
      owner: "",
      subs: [],
      predecessors: [],
      status: "todo",
      progress: 0,
      milestone: false,
      description: "",
    };
  }, [isEdit, task]);

  const [form, setForm] = React.useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-recompute duration when dates change
  const onDatesChange = (k, v) => {
    const next = { ...form, [k]: v };
    const days = daysBetween(next.start, next.end) + 1;
    if (days > 0) next.duration = days;
    setForm(next);
  };

  // Stop background scroll while open
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const onKey = (e) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="pw-modal" onKeyDown={onKey}>
      <div className="pw-modal__backdrop" onClick={onClose}/>
      <div className="pw-modal__card pw-modal__card--task" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="pw-modal__head">
          <div className="pw-modal__crumb">
            <span className="pw-chip pw-chip--ghost pw-chip--sm">
              <span className="pw-chip__dot" style={{ background: "var(--accent)" }}/>
              {phases.find(p => p.id === form.parent)?.name || "新規"}
            </span>
            <Icon name="chevronR" size={12}/>
            <span className="pw-modal__crumb-label">{isEdit ? "タスクを編集" : "新規タスク"}</span>
          </div>
          <button className="pw-icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={16}/>
          </button>
        </div>

        {/* Title row */}
        <div className="pw-modal__title-row">
          <button className={"pw-check" + (form.status === "done" ? " pw-check--on" : "")}
            onClick={() => set("status", form.status === "done" ? "todo" : "done")}
            aria-label="完了切替">
            <Icon name="check" size={14}/>
          </button>
          <input
            className="pw-modal__title-input"
            placeholder="タスク名を入力…"
            value={form.name}
            autoFocus={!isEdit}
            onChange={e => set("name", e.target.value)}
          />
          <button
            className={"pw-pill pw-pill--milestone-toggle" + (form.milestone ? " is-on" : "")}
            onClick={() => set("milestone", !form.milestone)}
            title="マイルストーン">
            <Icon name="flagSm" size={12}/> マイルストーン
          </button>
        </div>

        {/* Body — two-column form */}
        <div className="pw-modal__body">
          <div className="pw-form">
            <Field label="ステータス" hint="ステータスを選ぶと進捗が連動します（停滞は現在の進捗を維持）">
              <div className="pw-status-radio">
                {STATUSES.map(s => (
                  <button key={s.value}
                    className={"pw-pill pw-pill--status" + (form.status === s.value ? " is-active" : "")}
                    style={{ "--pill-color": s.color }}
                    onClick={() => {
                      const next = { ...form, status: s.value };
                      if (s.progress != null) next.progress = s.progress;
                      setForm(next);
                    }}>
                    <span className="pw-pill__dot" style={{ background: s.color }}/>
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="進捗" hint="ステータスから自動算出。微調整したい場合のみスライダーで上書き">
              <div className="pw-progress-edit">
                <input type="range" min="0" max="100" step="5"
                  value={Math.round(form.progress * 100)}
                  onChange={e => set("progress", Number(e.target.value) / 100)}/>
                <span className="pw-progress-edit__val">{Math.round(form.progress * 100)}%</span>
              </div>
            </Field>

            <Field label="フェーズ">
              <select className="pw-select" value={form.parent} onChange={e => set("parent", e.target.value)}>
                {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field label="期間">
              <div className="pw-duration">
                <input type="number" min="1" className="pw-input pw-input--num"
                  value={form.duration}
                  onChange={e => set("duration", Number(e.target.value))}/>
                <span className="pw-muted">営業日</span>
              </div>
            </Field>

            <Field label="開始日">
              <input type="date" className="pw-input" value={form.start}
                onChange={e => onDatesChange("start", e.target.value)}/>
            </Field>

            <Field label="終了日">
              <input type="date" className="pw-input" value={form.end}
                onChange={e => onDatesChange("end", e.target.value)}/>
            </Field>

            <Field label="主担当" hint="1名のみ。複数人いる場合は副担当で追加">
              <PersonPicker value={form.owner} onChange={v => set("owner", v)} exclude={form.subs}/>
            </Field>

            <Field label="副担当" hint="任意。サポート / レビュー担当など">
              <PeoplePicker values={form.subs} onChange={v => set("subs", v)} exclude={[form.owner]}/>
            </Field>

            <Field label="先行タスク (FS)" hint="このタスクの開始前に完了している必要があるタスク" full>
              <PredecessorPicker values={form.predecessors}
                onChange={v => set("predecessors", v)}
                tasks={allLeafTasks.filter(t => t.id !== task?.id)}
                onOpenTask={onOpenTask} />
            </Field>

            <Field label="説明" full>
              <textarea className="pw-textarea" rows={3}
                placeholder="作業内容、受け入れ基準、関連ドキュメントへのリンクなど…"
                value={form.description}
                onChange={e => set("description", e.target.value)}/>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="pw-modal__foot">
          <div className="pw-modal__foot-left">
            {isEdit && (
              <button className="pw-btn pw-btn--ghost pw-btn--danger">
                <Icon name="close" size={14}/> タスクを削除
              </button>
            )}
          </div>
          <div className="pw-modal__foot-right">
            <button className="pw-btn pw-btn--ghost" onClick={onClose}>キャンセル</button>
            <button className="pw-btn pw-btn--primary" onClick={onClose}>
              <Icon name="check" size={14}/> {isEdit ? "変更を保存" : "タスクを作成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── form primitives ───────────
function Field({ label, hint, full, children }) {
  return (
    <label className={"pw-field" + (full ? " pw-field--full" : "")}>
      <div className="pw-field__label">{label}</div>
      {children}
      {hint && <div className="pw-field__hint">{hint}</div>}
    </label>
  );
}

// Single-select person (owner)
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

// Multi-select people (subs)
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

// Predecessor multi-select with task search
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

Object.assign(window, { TaskModal });
