// Excel-like editable table view. Bidirectional sync with gantt via tasks store.
//
// Editing model:
//   - Click cell to focus, double-click or Enter to edit
//   - Tab / Shift+Tab move horizontally; Enter / Shift+Enter move vertically
//   - Esc cancels current edit; Enter commits
//   - Arrow keys move focus when not editing
//   - Tab on a leaf row at column 0 (name) indents → makes it a child of previous phase
//   - Shift+Tab outdents
//   - Last "+ 行を追加" row appends a new task on input
//   - Right-click a row → context menu (上に挿入 / 下に挿入 / 複製 / 削除 / インデント / アウトデント)
//   - Row drag handle on hover for reorder

const TABLE_COLUMNS = [
  { key: "name",         label: "タスク名",      width: 280, kind: "text",     sticky: true  },
  { key: "description",  label: "説明",           width: 220, kind: "longtext" },
  { key: "status",       label: "ステータス",    width: 130, kind: "status"   },
  { key: "owner",        label: "主担当",         width: 130, kind: "owner"    },
  { key: "subs",         label: "副担当",         width: 130, kind: "subs"     },
  { key: "start",        label: "開始日",         width: 110, kind: "date"     },
  { key: "end",          label: "終了日",         width: 110, kind: "date"     },
  { key: "duration",     label: "工数",           width: 70,  kind: "number", suffix: "日" },
  { key: "predecessors", label: "先行",           width: 180, kind: "deps"     },
  { key: "critical",     label: "CP",             width: 50,  kind: "flag"     },
];

// Cell editability rules. Phases: only name/description/start/end editable.
const PHASE_EDITABLE = ["name", "description", "start", "end"];

function TableScreen({ onOpenTask, onCreateTask, askDeleteTask, askConfirm, closeConfirm }) {
  const tasks = useTasks();
  useResources();   // re-render owner filter options when resources change
  const [focus, setFocus] = React.useState({ row: 0, col: 0 });
  const [editing, setEditing] = React.useState(null);     // { row, col, draft }
  const [contextMenu, setContextMenu] = React.useState(null); // { x, y, taskId }
  const [filterPhase, setFilterPhase] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState([]);   // resourceIds (multi-select)
  const [statusFilter, setStatusFilter] = React.useState([]); // status values (multi-select)
  const [savedFlash, setSavedFlash] = React.useState(0);
  const [colWidths, setColWidths] = React.useState(() => TABLE_COLUMNS.map(c => c.width));
  const [resizing, setResizing] = React.useState(null);   // { ci, startX, startW }

  // CSV import file picker (hidden <input>)
  const fileInputRef = React.useRef(null);
  const handleExport = () => {
    const csv = tasksToCsv(tasks);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(`tasks-${ts}.csv`, csv);
  };
  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";  // allow re-selecting same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const { tasks: parsed, errors } = csvToTasks(text);
      if (errors.length > 0) {
        if (askConfirm) askConfirm({
          title: "CSV を読み込めませんでした",
          body: <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((er, i) => <li key={i}>{er}</li>)}</ul>,
          confirmLabel: "閉じる",
          destructive: false,
          onConfirm: () => closeConfirm && closeConfirm(),
        });
        return;
      }
      const phaseCount = parsed.filter(t => t.isPhase).length;
      const leafCount  = parsed.filter(t => !t.isPhase).length;
      const fileName   = file.name;
      if (askConfirm) askConfirm({
        title: "CSV をインポートしますか？",
        body: (
          <>
            <p>「<strong>{fileName}</strong>」から <strong>{parsed.length} 行</strong>
              （フェーズ {phaseCount} / タスク {leafCount}）を読み込みます。</p>
            <p className="pw-confirm__warn">⚠️ 既存のタスクはすべて置き換えられます。</p>
          </>
        ),
        confirmLabel: "インポート",
        destructive: true,
        onConfirm: () => {
          setTasks(parsed);
          flashSaved();
          closeConfirm && closeConfirm();
        },
      });
    };
    reader.readAsText(file);
  };

  // Column resize — drag from header right edge. Min 50px.
  React.useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const next = Math.max(50, resizing.startW + dx);
      setColWidths(ws => ws.map((w, i) => i === resizing.ci ? next : w));
    };
    const onUp = () => setResizing(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  const startResize = (ci, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ ci, startX: e.clientX, startW: colWidths[ci] });
  };
  const autoFitCol = (ci) => {
    setColWidths(ws => ws.map((w, i) => i === ci ? TABLE_COLUMNS[ci].width : w));
  };

  // Display rows = filter + (always include phase header rows when their leaves match)
  const displayed = React.useMemo(() => {
    const q = search.toLowerCase();
    const ownerSet = new Set(ownerFilter);
    const statusSet = new Set(statusFilter);
    const hasOwner = ownerSet.size > 0;
    const hasStatus = statusSet.size > 0;
    if (filterPhase === "all" && !q && !hasOwner && !hasStatus) return tasks;

    const rowsByPhase = {};
    tasks.forEach(t => {
      if (t.isPhase) rowsByPhase[t.id] = { phase: t, leaves: [] };
    });
    tasks.forEach(t => {
      if (t.isPhase) return;
      const matchesPhase = filterPhase === "all" || t.parent === filterPhase;
      const matchesSearch = !q || t.name.toLowerCase().includes(q);
      const matchesOwner = !hasOwner
        || ownerSet.has(t.owner)
        || (t.subs || []).some(s => ownerSet.has(s));
      const matchesStatus = !hasStatus || statusSet.has(t.status);
      if (matchesPhase && matchesSearch && matchesOwner && matchesStatus) {
        rowsByPhase[t.parent]?.leaves.push(t);
      }
    });
    const out = [];
    tasks.forEach(t => {
      if (t.isPhase) {
        const e = rowsByPhase[t.id];
        if (e && e.leaves.length > 0) out.push(t, ...e.leaves);
      }
    });
    return out;
  }, [tasks, filterPhase, search, ownerFilter, statusFilter]);

  const flashSaved = () => {
    setSavedFlash(Date.now());
  };

  // Mutation helpers — wrapped to flash "保存済み"
  const commit = (taskId, patch) => { updateTask(taskId, patch); flashSaved(); };

  const moveFocus = (dr, dc) => {
    setFocus(f => {
      const cols = TABLE_COLUMNS.length;
      const rows = displayed.length;
      let r = f.row + dr, c = f.col + dc;
      if (c < 0) { c = cols - 1; r--; }
      if (c >= cols) { c = 0; r++; }
      r = Math.max(0, Math.min(rows - 1, r));
      // Skip non-applicable cells on phase rows when moving horizontally
      const phaseRow = displayed[r]?.isPhase;
      const col = TABLE_COLUMNS[c];
      if (phaseRow && !PHASE_EDITABLE.includes(col.key)) {
        if (dc !== 0) return { row: r, col: c }; // allow but cell is read-only
      }
      return { row: r, col: c };
    });
  };

  const beginEdit = (row, col, initial) => {
    const task = displayed[row];
    if (!task) return;
    const colDef = TABLE_COLUMNS[col];
    if (task.isPhase && !PHASE_EDITABLE.includes(colDef.key)) return; // phases: limited edit
    if (colDef.kind === "flag") { commit(task.id, { critical: !task.critical }); return; }
    setEditing({ row, col, draft: initial !== undefined ? initial : task[colDef.key] });
  };

  const cancelEdit = () => setEditing(null);
  const commitEdit = (val, advance) => {
    if (!editing) return;
    const task = displayed[editing.row];
    const colDef = TABLE_COLUMNS[editing.col];
    if (!task) { setEditing(null); return; }
    let patch = {};
    const calendar = getCalendarFor((window.PROJECTS || []).find(x => x.current));
    if (colDef.kind === "number") {
      const n = parseInt(val, 10);
      if (!isNaN(n)) {
        patch[colDef.key] = n;
        // Editing duration → recompute end based on working days
        if (colDef.key === "duration" && task.start) {
          patch.end = addWorkingDays(task.start, Math.max(1, n) - 1, calendar);
        }
      }
    } else if (colDef.kind === "date") {
      patch[colDef.key] = val;
      // Snap the other endpoint if the new value would invert the range,
      // then recompute duration in working days.
      const next = { ...task, ...patch };
      if (next.start && next.end && parseDate(next.start) > parseDate(next.end)) {
        if (colDef.key === "start") patch.end = val;
        else patch.start = val;
      }
      const recomputed = { ...task, ...patch };
      if (recomputed.start && recomputed.end) {
        patch.duration = Math.max(0, workingDaysBetween(recomputed.start, recomputed.end, calendar));
      }
    } else if (colDef.kind === "status") {
      patch.status = val;
      // Status drives progress for leaf tasks. Phases keep their aggregate
      // progress (computed elsewhere) and `blocked` preserves current progress.
      if (!task.isPhase) {
        const meta = STATUS_BY_VALUE[val];
        if (meta && meta.progress != null) patch.progress = meta.progress;
      }
    } else {
      patch[colDef.key] = val;
    }
    commit(task.id, patch);
    setEditing(null);
    if (advance === "right") moveFocus(0, 1);
    else if (advance === "down") moveFocus(1, 0);
  };

  // Indent / outdent
  const indent = (taskId) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === taskId);
      if (idx <= 0) return prev;
      const t = prev[idx];
      if (t.isPhase) return prev; // phases can't indent further (already top)
      // Make this task a child of the previous leaf's parent's previous-phase isn't needed; here we just nest under previous leaf
      // Simpler: become a sub-task by depth + 1, no parent change (mock)
      return prev.map(x => x.id === taskId ? { ...x, depth: Math.min(3, (x.depth || 1) + 1) } : x);
    });
    flashSaved();
  };
  const outdent = (taskId) => {
    setTasks(prev => {
      const t = prev.find(x => x.id === taskId);
      if (!t) return prev;
      if (t.isPhase) return prev;
      if ((t.depth || 1) <= 1) {
        // Promote leaf to phase
        return prev.map(x => x.id === taskId ? { ...x, isPhase: true, depth: 0, parent: undefined, owner: undefined, subs: [], predecessors: [], critical: false } : x);
      }
      return prev.map(x => x.id === taskId ? { ...x, depth: (x.depth || 1) - 1 } : x);
    });
    flashSaved();
  };

  // Insert / delete / duplicate
  const insertRowAt = (idx, asPhase = false) => {
    setTasks(prev => {
      const above = prev[idx - 1];
      const parent = asPhase ? undefined : (above?.isPhase ? above.id : above?.parent);
      const newId = "n" + Math.random().toString(36).slice(2, 7);
      const tomorrow = above?.start || PROJECT.startDate;
      const node = asPhase
        ? { id: newId, name: "", isPhase: true, start: tomorrow, end: tomorrow, progress: 0, depth: 0, status: "todo" }
        : { id: newId, name: "", parent, start: tomorrow, end: tomorrow, duration: 1, progress: 0, owner: undefined, subs: [], depth: 1, predecessors: [], critical: false, status: "todo" };
      const next = [...prev];
      next.splice(idx, 0, node);
      return next;
    });
    flashSaved();
    setTimeout(() => beginEdit(idx, 0, ""), 30);
    setFocus({ row: idx, col: 0 });
  };
  const deleteRow = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId && t.parent !== taskId));
    flashSaved();
  };
  const duplicateRow = (taskId) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === taskId);
      if (idx < 0) return prev;
      const t = prev[idx];
      const copy = { ...t, id: "n" + Math.random().toString(36).slice(2, 7), name: t.name + " (コピー)" };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    flashSaved();
  };
  const appendRow = () => {
    setTasks(prev => {
      const lastPhase = [...prev].reverse().find(t => t.isPhase);
      const newId = "n" + Math.random().toString(36).slice(2, 7);
      const node = { id: newId, name: "", parent: lastPhase?.id, start: PROJECT.startDate, end: PROJECT.startDate, duration: 1, progress: 0, owner: undefined, subs: [], depth: 1, predecessors: [], critical: false, status: "todo" };
      return [...prev, node];
    });
    flashSaved();
    setTimeout(() => {
      const newIdx = displayed.length;
      setFocus({ row: newIdx, col: 0 });
      beginEdit(newIdx, 0, "");
    }, 30);
  };

  // Keyboard nav
  React.useEffect(() => {
    const onKey = (e) => {
      if (contextMenu) {
        if (e.key === "Escape") setContextMenu(null);
        return;
      }
      if (editing) return; // edit-mode handles its own keys
      if (e.target.matches("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(0, 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(0, -1); }
      else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); beginEdit(focus.row, focus.col); }
      else if (e.key === "Tab") {
        e.preventDefault();
        // Tab on name col (col 0) with Cmd/Ctrl = indent/outdent
        if (focus.col === 0 && (e.metaKey || e.ctrlKey)) {
          const t = displayed[focus.row];
          if (e.shiftKey) outdent(t.id);
          else indent(t.id);
        } else {
          moveFocus(0, e.shiftKey ? -1 : 1);
        }
      }
      else if (e.key === "Delete" || e.key === "Backspace") {
        const t = displayed[focus.row];
        const colDef = TABLE_COLUMNS[focus.col];
        if (t && !t.isPhase && colDef.kind !== "flag") {
          e.preventDefault();
          commit(t.id, { [colDef.key]: colDef.kind === "number" || colDef.kind === "progress" ? 0 : "" });
        }
      }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        // Start typing → enter edit with that character
        beginEdit(focus.row, focus.col, e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, editing, displayed, contextMenu]);

  // Close context menu on click outside
  React.useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => setContextMenu(null);
    setTimeout(() => document.addEventListener("click", onClick, { once: true }), 0);
  }, [contextMenu]);

  const openContextAt = (e, taskId, rowIdx) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, taskId, rowIdx });
    setFocus({ row: rowIdx, col: 0 });
  };

  const phases = tasks.filter(t => t.isPhase);
  const showSaved = Date.now() - savedFlash < 1500;

  return (
    <div className="pw-table-screen">
      <div className="pw-view-toolbar pw-table-toolbar">
        <div className="pw-view-toolbar__left">
          <div className="pw-search pw-search--inline">
            <Icon name="search" size={14}/>
            <input className="pw-search__input" placeholder="このビューを絞り込み…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="pw-phase-tabs" role="tablist" aria-label="フェーズで絞り込み">
            <button role="tab"
              className={"pw-phase-tab" + (filterPhase === "all" ? " is-active" : "")}
              onClick={() => setFilterPhase("all")}>すべて</button>
            {phases.map(p => (
              <button key={p.id} role="tab"
                className={"pw-phase-tab" + (filterPhase === p.id ? " is-active" : "")}
                onClick={() => setFilterPhase(p.id)}>{p.name}</button>
            ))}
          </div>
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
        </div>
        <div className="pw-view-toolbar__right">
          {/* Permissive accept — some systems don't tag CSV files with a
              recognized MIME type (e.g. Excel-exported CSVs).
              Falling back to extension + plain text + any file. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel,application/csv"
            style={{ display: "none" }}
            onChange={handleImportFile}/>
          <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={handleImportClick} title="CSV からタスクをインポート">
            <Icon name="upload" size={14}/> CSV インポート
          </button>
          <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={handleExport} title="現在のタスク一覧を CSV でダウンロード">
            <Icon name="download" size={14}/> CSV エクスポート
          </button>
          <span className="pw-divider-v"/>
          <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateTask}>
            <Icon name="plus" size={14}/> 新規タスク
          </button>
        </div>
      </div>

      <div className={"pw-table-wrap" + (resizing ? " is-resizing" : "")}>
        <div className="pw-table-grid"
             style={{ gridTemplateColumns: `28px ${colWidths.map(w => w + "px").join(" ")} 1fr` }}>
          {/* Header */}
          <div className="pw-tg-cell pw-tg-cell--head pw-tg-cell--rownum"></div>
          {TABLE_COLUMNS.map((c, ci) => (
            <div key={c.key}
              className={"pw-tg-cell pw-tg-cell--head" + (c.sticky ? " pw-tg-cell--sticky" : "") + (resizing?.ci === ci ? " pw-tg-cell--resizing" : "")}>
              <span>{c.label}</span>
              <button className="pw-tg-sort"><Icon name="chevronD" size={10}/></button>
              <span className="pw-tg-resize"
                onMouseDown={(e) => startResize(ci, e)}
                onDoubleClick={() => autoFitCol(ci)}
                title="ドラッグで幅を変更（ダブルクリックで初期値に戻す）"/>
            </div>
          ))}
          <div className="pw-tg-cell pw-tg-cell--head"></div>

          {/* Rows */}
          {displayed.map((task, ri) => (
            <TableRow key={task.id}
              task={task}
              rowIdx={ri}
              focus={focus}
              editing={editing}
              onCellClick={(ci) => setFocus({ row: ri, col: ci })}
              onCellDoubleClick={(ci) => beginEdit(ri, ci)}
              onCommit={commitEdit}
              onCancel={cancelEdit}
              onSetDraft={(d) => setEditing(e => e && { ...e, draft: d })}
              onContextMenu={(e) => openContextAt(e, task.id, ri)}
              onOpenTask={onOpenTask}
              isFirstOfPhase={ri === 0 || displayed[ri-1]?.isPhase !== task.isPhase || (task.isPhase && true)}
            />
          ))}

          {/* Empty state — distinguishes "no tasks at all" from "filtered out". */}
          {displayed.length === 0 && (
            <div className="pw-tg-empty-row"
              style={{ gridColumn: `1 / span ${TABLE_COLUMNS.length + 2}` }}>
              {tasks.length === 0 ? (
                <div className="pw-empty pw-empty--onboarding">
                  <YuiPathMark size={56}/>
                  <div className="pw-empty__title">タスクがまだありません</div>
                  <div className="pw-empty__sub">直接入力するか、CSV から取り込んで始められます。</div>
                  <div className="pw-empty__cta-row">
                    <button className="pw-btn pw-btn--primary pw-btn--sm" onClick={onCreateTask}>
                      <Icon name="plus" size={14}/> 最初のタスクを追加
                    </button>
                    <button className="pw-btn pw-btn--ghost pw-btn--sm" onClick={handleImportClick}>
                      <Icon name="upload" size={14}/> CSV をインポート
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pw-empty">
                  <Icon name="search" size={28}/>
                  <div className="pw-empty__title">該当するタスクがありません</div>
                  <div className="pw-empty__sub">フィルタを変更するか、解除して再表示できます</div>
                  {(filterPhase !== "all" || search || ownerFilter.length || statusFilter.length) > 0 && (
                    <button className="pw-btn pw-btn--ghost pw-btn--sm"
                      onClick={() => {
                        setFilterPhase("all"); setSearch("");
                        setOwnerFilter([]); setStatusFilter([]);
                      }}>
                      <Icon name="close" size={12}/> フィルタを解除
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Append row */}
          <div className="pw-tg-cell pw-tg-cell--rownum pw-tg-cell--append"></div>
          <div className="pw-tg-cell pw-tg-cell--append pw-tg-cell--add"
               style={{ gridColumn: `2 / span ${TABLE_COLUMNS.length + 1}` }}
               onClick={appendRow}>
            <Icon name="plus" size={13}/> 行を追加（または最終行で Enter）
          </div>
        </div>
      </div>

      <div className="pw-table-foot">
        <span><Icon name="table" size={12}/> {displayed.filter(t => !t.isPhase).length} タスク · {phases.length} フェーズ</span>
        <span className="pw-table-foot__center">
          <span className={"pw-table-saved" + (showSaved ? " is-on" : "")}>
            <Icon name="check" size={12}/> 保存済み
          </span>
        </span>
        <span className="pw-table-foot__hint">
          <kbd className="pw-kbd">Tab</kbd> 次セル ·
          <kbd className="pw-kbd">⌘+Tab</kbd> インデント ·
          <kbd className="pw-kbd">Enter</kbd> 編集 ·
          <kbd className="pw-kbd">右クリック</kbd> メニュー
        </span>
      </div>

      {contextMenu && (
        <ContextMenu menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={(act) => {
            const t = tasks.find(x => x.id === contextMenu.taskId);
            const idx = tasks.findIndex(x => x.id === contextMenu.taskId);
            if (act === "insert-above") insertRowAt(idx);
            else if (act === "insert-below") insertRowAt(idx + 1);
            else if (act === "insert-phase") insertRowAt(idx + 1, true);
            else if (act === "duplicate") duplicateRow(contextMenu.taskId);
            else if (act === "delete") {
              if (askDeleteTask) askDeleteTask(contextMenu.taskId);
              else deleteRow(contextMenu.taskId);
            }
            else if (act === "indent") indent(contextMenu.taskId);
            else if (act === "outdent") outdent(contextMenu.taskId);
            else if (act === "open") onOpenTask(contextMenu.taskId);
            setContextMenu(null);
          }}
          task={tasks.find(x => x.id === contextMenu.taskId)}
        />
      )}
    </div>
  );
}

// ─────────── Single row ───────────
function TableRow({ task, rowIdx, focus, editing, onCellClick, onCellDoubleClick, onCommit, onCancel, onSetDraft, onContextMenu, onOpenTask }) {
  const isPhase = task.isPhase;
  return (
    <>
      <div className={"pw-tg-cell pw-tg-cell--rownum" + (isPhase ? " pw-tg-cell--phase" : "")}
           onContextMenu={onContextMenu}>
        <span className="pw-tg-rownum">{rowIdx + 1}</span>
        <button className="pw-tg-rowmenu" onClick={onContextMenu}><Icon name="moreH" size={12}/></button>
      </div>
      {TABLE_COLUMNS.map((col, ci) => {
        const isFocused = focus.row === rowIdx && focus.col === ci;
        const isEditing = editing && editing.row === rowIdx && editing.col === ci;
        return (
          <Cell key={col.key}
            task={task} col={col}
            isFocused={isFocused} isEditing={isEditing} editing={editing}
            onClick={() => onCellClick(ci)}
            onDoubleClick={() => onCellDoubleClick(ci)}
            onCommit={onCommit} onCancel={onCancel} onSetDraft={onSetDraft}
            onContextMenu={onContextMenu}
            onOpenTask={onOpenTask}
          />
        );
      })}
      <div className={"pw-tg-cell pw-tg-cell--filler" + (isPhase ? " pw-tg-cell--phase" : "")}
           onContextMenu={onContextMenu}>
        {isPhase && <span className="pw-tg-phase-meta">{Math.round(task.progress*100)}%</span>}
      </div>
    </>
  );
}

// ─────────── Cell ───────────
function Cell({ task, col, isFocused, isEditing, editing, onClick, onDoubleClick, onCommit, onCancel, onSetDraft, onContextMenu, onOpenTask }) {
  const isPhase = task.isPhase;
  const editable = !isPhase || PHASE_EDITABLE.includes(col.key);
  const cls = [
    "pw-tg-cell",
    "pw-tg-cell--" + col.kind,
    isPhase && "pw-tg-cell--phase",
    isFocused && "pw-tg-cell--focused",
    isEditing && "pw-tg-cell--editing",
    !editable && "pw-tg-cell--ro",
    col.sticky && "pw-tg-cell--sticky",
  ].filter(Boolean).join(" ");

  if (isEditing) {
    return (
      <div className={cls}>
        <CellEditor task={task} col={col} draft={editing.draft}
          setDraft={onSetDraft}
          onCommit={onCommit} onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className={cls}
      onClick={onClick}
      onDoubleClick={() => editable && onDoubleClick()}
      onContextMenu={onContextMenu}
    >
      <CellValue task={task} col={col} onOpenTask={onOpenTask}/>
    </div>
  );
}

// ─────────── Cell value rendering ───────────
function CellValue({ task, col, onOpenTask }) {
  const isPhase = task.isPhase;
  const v = task[col.key];

  if (col.key === "name") {
    const nextMs = isPhase ? nextMilestoneFor(task.id, window.TASKS || [], TODAY) : null;
    return (
      <div className="pw-tg-name">
        <span className="pw-tg-name__indent" style={{ width: (task.depth || 0) * 16 }} />
        {isPhase ? (
          <span className="pw-tg-phase-marker"/>
        ) : (
          <span className="pw-tg-leaf-marker"/>
        )}
        <span className={"pw-tg-name__text" + (isPhase ? " pw-tg-name__text--phase" : "") + (!task.name ? " pw-tg-name__text--empty" : "")}>
          {task.name || "新しいタスク…"}
        </span>
        {task.milestone && <Icon name="flagSm" size={12} className="pw-tg-name__milestone"/>}
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
        {!isPhase && (
          <button className="pw-tg-name__open"
            onClick={(e) => { e.stopPropagation(); onOpenTask(task.id); }}
            title="詳細を開く">
            <Icon name="panelR" size={14}/>
          </button>
        )}
      </div>
    );
  }
  if (col.kind === "longtext") {
    if (!v) return <span className="pw-tg-empty">—</span>;
    return <span className="pw-tg-longtext" title={v}>{v}</span>;
  }
  if (col.kind === "status") return <TableStatusPill status={v}/>;
  if (col.kind === "owner" && !isPhase) {
    const r = RESOURCES.find(x => x.id === v);
    return r ? <div className="pw-tg-owner"><Avatar resource={r} size={20}/><span>{r.name.split(" ")[0]}</span></div> : <span className="pw-tg-empty">—</span>;
  }
  if (col.kind === "subs" && !isPhase) {
    const subs = (v || []).map(id => RESOURCES.find(x => x.id === id)).filter(Boolean);
    if (!subs.length) return <span className="pw-tg-empty">—</span>;
    return <AvatarStack ids={subs.map(r => r.id)} size={20}/>;
  }
  if (col.kind === "date") {
    if (!v) return <span className="pw-tg-empty">—</span>;
    return <span className="pw-tg-date">{fmtJP(v)}</span>;
  }
  if (col.kind === "number") {
    if (v == null) return <span className="pw-tg-empty">—</span>;
    return <span className="pw-tg-num">{v}{col.suffix || ""}</span>;
  }
  if (col.kind === "deps" && !isPhase) {
    const preds = (v || []);
    if (!preds.length) return <span className="pw-tg-empty">—</span>;
    const names = preds
      .map(id => (window.TASKS || []).find(t => t.id === id))
      .filter(Boolean);
    return (
      <div className="pw-tg-deps-chips">
        {names.map(t => (
          <span key={t.id} className="pw-tg-dep-chip" title={t.name}>
            <Icon name="link" size={10}/>
            <span className="pw-tg-dep-chip__name">{t.name}</span>
          </span>
        ))}
      </div>
    );
  }
  if (col.kind === "flag" && !isPhase) {
    return v ? <span className="pw-tg-cp">CP</span> : <span className="pw-tg-empty">—</span>;
  }
  return <span className="pw-tg-empty">—</span>;
}

// ─────────── Cell editor ───────────
function CellEditor({ task, col, draft, setDraft, onCommit, onCancel }) {
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current?.select) inputRef.current.select();
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      onCommit(draft, e.shiftKey ? null : "down");
    }
    else if (e.key === "Tab") {
      e.preventDefault();
      onCommit(draft, e.shiftKey ? "left" : "right");
    }
  };

  if (col.kind === "status") {
    return <StatusEditor draft={draft} setDraft={setDraft} onCommit={onCommit} onCancel={onCancel}/>;
  }
  if (col.kind === "owner") {
    return <OwnerEditor draft={draft} setDraft={setDraft} onCommit={onCommit} onCancel={onCancel}/>;
  }
  if (col.kind === "subs") {
    return <SubsEditor draft={draft || []} setDraft={setDraft} onCommit={onCommit} onCancel={onCancel}/>;
  }
  if (col.kind === "deps") {
    return <DepsEditor task={task} draft={draft || []} setDraft={setDraft} onCommit={onCommit} onCancel={onCancel}/>;
  }
  if (col.kind === "longtext") {
    return <LongtextEditor draft={draft || ""} setDraft={setDraft} onCommit={onCommit} onCancel={onCancel}/>;
  }
  if (col.kind === "date") {
    return (
      <input ref={inputRef} type="date" className="pw-tg-input"
        value={draft || ""}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => onCommit(draft)}
      />
    );
  }
  if (col.kind === "number") {
    return (
      <input ref={inputRef} type="number" className="pw-tg-input pw-tg-input--num"
        value={draft ?? ""}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => onCommit(draft)}
      />
    );
  }
  // Text default
  return (
    <input ref={inputRef} type="text" className="pw-tg-input"
      value={draft || ""}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onCommit(draft)}
    />
  );
}

// STATUSES + STATUS_BY_VALUE come from data.jsx (window globals).

function TableStatusPill({ status }) {
  const s = STATUS_BY_VALUE[status] || STATUSES[0];
  return (
    <span className="pw-tg-status">
      <span className="pw-tg-status__dot" style={{ background: s.color }}/>
      {s.short}
    </span>
  );
}

function StatusEditor({ draft, setDraft, onCommit, onCancel }) {
  // Show 停滞 separated visually since it's orthogonal to ordinal progress.
  const ordinal = STATUSES.filter(s => s.value !== "blocked");
  const blocked = STATUSES.find(s => s.value === "blocked");
  return (
    <div className="pw-tg-popover">
      {ordinal.map(s => (
        <button key={s.value} className={"pw-tg-popover__item" + (draft === s.value ? " is-selected" : "")}
          onClick={() => onCommit(s.value, "down")}>
          <span className="pw-tg-status__dot" style={{ background: s.color }}/>
          {s.label}
          {draft === s.value && <Icon name="check" size={12}/>}
        </button>
      ))}
      <div className="pw-tg-popover__divider"/>
      <button className={"pw-tg-popover__item" + (draft === blocked.value ? " is-selected" : "")}
        onClick={() => onCommit(blocked.value, "down")}>
        <span className="pw-tg-status__dot" style={{ background: blocked.color }}/>
        {blocked.label}
        {draft === blocked.value && <Icon name="check" size={12}/>}
      </button>
    </div>
  );
}

function OwnerEditor({ draft, setDraft, onCommit, onCancel }) {
  return (
    <div className="pw-tg-popover">
      <button className="pw-tg-popover__item" onClick={() => onCommit(undefined, "down")}>
        <span className="pw-tg-empty">なし</span>
      </button>
      {RESOURCES.map(r => (
        <button key={r.id} className={"pw-tg-popover__item" + (draft === r.id ? " is-selected" : "")}
          onClick={() => onCommit(r.id, "down")}>
          <Avatar resource={r} size={20}/>
          <div className="pw-tg-popover__owner">
            <div>{r.name}</div>
            <div className="pw-tg-popover__role">{r.role}</div>
          </div>
          {draft === r.id && <Icon name="check" size={12}/>}
        </button>
      ))}
    </div>
  );
}

// Multi-line text edited in a popover so the cell stays a single row tall.
function LongtextEditor({ draft, setDraft, onCommit, onCancel }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    ref.current?.focus();
    const len = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(len, len);
  }, []);
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); onCommit(draft, "down");
    }
    else if (e.key === "Tab") {
      e.preventDefault(); onCommit(draft, e.shiftKey ? "left" : "right");
    }
    // Plain Enter inserts a newline (default textarea behavior).
  };
  return (
    <div className="pw-tg-popover pw-tg-popover--longtext">
      <textarea ref={ref}
        className="pw-tg-textarea"
        rows={4}
        placeholder="作業内容、受け入れ基準、関連リンクなど…"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="pw-tg-popover__foot">
        <span className="pw-tg-popover__hint">
          <kbd className="pw-kbd">⌘Enter</kbd> 確定 ·
          <kbd className="pw-kbd">Esc</kbd> キャンセル
        </span>
        <button className="pw-tg-popover__done" onClick={() => onCommit(draft, "down")}>
          <Icon name="check" size={12}/> 確定
        </button>
      </div>
    </div>
  );
}

// Predecessor picker — search box + filtered task list, multi-select.
function DepsEditor({ task, draft, setDraft, onCommit, onCancel }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const allTasks = window.TASKS || [];
  const candidates = allTasks.filter(t => !t.isPhase && t.id !== task.id);
  const filtered = candidates.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => {
    setDraft(draft.includes(id) ? draft.filter(x => x !== id) : [...draft, id]);
  };
  const phasesById = Object.fromEntries(allTasks.filter(t => t.isPhase).map(p => [p.id, p]));
  return (
    <div className="pw-tg-popover pw-tg-popover--deps">
      <div className="pw-tg-popover__search">
        <Icon name="search" size={12}/>
        <input ref={inputRef}
          className="pw-tg-popover__search-input"
          placeholder="タスク名で検索…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            if (e.key === "Enter") { e.preventDefault(); onCommit(draft, "down"); }
          }}
        />
      </div>
      <div className="pw-tg-popover__list">
        {filtered.map(t => {
          const on = draft.includes(t.id);
          const phase = phasesById[t.parent];
          return (
            <button key={t.id}
              className={"pw-tg-popover__item pw-tg-popover__item--task" + (on ? " is-selected" : "")}
              onClick={() => toggle(t.id)}>
              <span className={"pw-checkbox" + (on ? " is-on" : "")}>
                {on && <Icon name="check" size={9}/>}
              </span>
              <span className="pw-tg-popover__task">
                <span className="pw-tg-popover__task-name">{t.name}</span>
                {phase && <span className="pw-tg-popover__task-meta">{phase.name}</span>}
              </span>
              {t.critical && <span className="pw-tg-cp">CP</span>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="pw-tg-popover__empty">該当するタスクがありません</div>
        )}
      </div>
      <button className="pw-tg-popover__done" onClick={() => onCommit(draft, "down")}>
        <Icon name="check" size={12}/> 確定（{draft.length}件）
      </button>
    </div>
  );
}

function SubsEditor({ draft, setDraft, onCommit, onCancel }) {
  const toggle = (id) => {
    const next = draft.includes(id) ? draft.filter(x => x !== id) : [...draft, id];
    setDraft(next);
  };
  return (
    <div className="pw-tg-popover">
      {RESOURCES.map(r => {
        const on = draft.includes(r.id);
        return (
          <button key={r.id} className={"pw-tg-popover__item" + (on ? " is-selected" : "")}
            onClick={() => toggle(r.id)}>
            <span className={"pw-checkbox" + (on ? " is-on" : "")}>
              {on && <Icon name="check" size={9}/>}
            </span>
            <Avatar resource={r} size={20}/>
            <div className="pw-tg-popover__owner">
              <div>{r.name}</div>
              <div className="pw-tg-popover__role">{r.role}</div>
            </div>
          </button>
        );
      })}
      <button className="pw-tg-popover__done" onClick={() => onCommit(draft, "down")}>
        <Icon name="check" size={12}/> 確定
      </button>
    </div>
  );
}

// ─────────── Context menu ───────────
function ContextMenu({ menu, onClose, onAction, task }) {
  if (!task) return null;
  const isPhase = task.isPhase;
  const items = [
    !isPhase && { id: "open",         label: "詳細を開く",       icon: "chevronR", shortcut: "" },
    !isPhase && { id: "indent",       label: "インデント",       icon: "indent",  shortcut: "⌘Tab" },
    !isPhase && { id: "outdent",      label: "アウトデント",     icon: "outdent", shortcut: "⌘⇧Tab" },
    { divider: true },
    { id: "insert-above",            label: "上に行を挿入",    icon: "insert" },
    { id: "insert-below",            label: "下に行を挿入",    icon: "insert" },
    { id: "insert-phase",            label: "下にフェーズを挿入", icon: "insert" },
    { id: "duplicate",               label: "複製",            icon: "copy" },
    { divider: true },
    { id: "delete",                  label: "削除",            icon: "trash", danger: true },
  ].filter(Boolean);

  return (
    <div className="pw-tg-ctx" style={{ left: menu.x, top: menu.y }}>
      {items.map((it, i) => it.divider ? (
        <div key={i} className="pw-tg-ctx__divider"/>
      ) : (
        <button key={it.id}
          className={"pw-tg-ctx__item" + (it.danger ? " pw-tg-ctx__item--danger" : "")}
          onClick={() => onAction(it.id)}>
          <Icon name={it.icon} size={14}/>
          <span>{it.label}</span>
          {it.shortcut && <kbd className="pw-kbd">{it.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
