// App shell — sidebar nav + topbar + content router

const NAV = [
  { id: "dashboard", label: "ダッシュボード", icon: "home" },
  { id: "table",     label: "テーブル",       icon: "table" },
  { id: "gantt",     label: "ガントチャート",  icon: "gantt" },
  { id: "resources", label: "リソース",       icon: "users" },
];

function App() {
  // Subscribe at the root so any task / resource / project edit re-renders the tree.
  useTasks();
  useResources();
  useProjects();

  const [t, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "primaryColor": "#3D6BE0",
    "density": "comfortable",
    "ganttZoom": "week",
    "sidebarCollapsed": false
  }/*EDITMODE-END*/);
  const tweaks = { t, setTweak, ganttZoom: t.ganttZoom };

  // Apply primary color to CSS var
  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.primaryColor);
    const rgb = hexToRgb(t.primaryColor);
    if (rgb) {
      document.documentElement.style.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`);
      document.documentElement.style.setProperty("--accent-soft-2", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
    }
    document.documentElement.dataset.density = t.density;
  }, [t.primaryColor, t.density]);

  const [view, setView] = React.useState("table");
  const [openTaskId, setOpenTaskId] = React.useState(null);
  // When set, the TaskDrawer scrolls this section into view on mount —
  // used by the activity feed so a "comment added" entry lands on the comment.
  const [openTaskScrollTo, setOpenTaskScrollTo] = React.useState(null);
  const [openTaskCommentId, setOpenTaskCommentId] = React.useState(null);
  const [openResourceId, setOpenResourceId] = React.useState(null);
  const [openProjectId, setOpenProjectId] = React.useState(null);
  const [showProjectsList, setShowProjectsList] = React.useState(false);
  // Generic confirm dialog state — used for all destructive operations.
  const [confirm, setConfirm] = React.useState(null);
  const askConfirm = (params) => setConfirm(params);
  const closeConfirm = () => setConfirm(null);

  const openTask = (id, scrollTo = null, commentId = null) => {
    setOpenTaskScrollTo(scrollTo);
    setOpenTaskCommentId(commentId);
    setOpenTaskId(id);
  };
  const closeTask = () => {
    // Auto-cleanup: a freshly created task left with no name is treated as
    // "cancelled" (closing the drawer == discarding). IDs from openCreate start with "n".
    setOpenTaskId(id => {
      if (id && id.startsWith("n")) {
        const t = (window.TASKS || []).find(x => x.id === id);
        if (t && !t.name?.trim()) setTasks(prev => prev.filter(x => x.id !== id));
      }
      return null;
    });
  };

  // 新規タスク: append an empty task to the last phase, then open the drawer.
  // The drawer becomes the create UI — no modal, edits auto-save.
  const openCreate = () => {
    const newId = "n" + Math.random().toString(36).slice(2, 7);
    setTasks(prev => {
      const lastPhase = [...prev].reverse().find(x => x.isPhase);
      const today = PROJECT.startDate;
      const node = {
        id: newId, name: "", parent: lastPhase?.id,
        start: today, end: today, duration: 1, progress: 0,
        owner: undefined, subs: [], depth: 1,
        predecessors: [], critical: false, status: "todo",
        description: "",
      };
      return [...prev, node];
    });
    setOpenTaskId(newId);
  };

  const deleteTask = (id) => {
    // Phase deletion cascades to its children. Also clean up `predecessors`
    // references so dangling task ids don't linger.
    setTasks(prev => {
      const removeIds = new Set([id]);
      prev.forEach(t => { if (t.parent === id) removeIds.add(t.id); });
      return prev
        .filter(t => !removeIds.has(t.id))
        .map(t => {
          if (!t.predecessors?.some(p => removeIds.has(p))) return t;
          return { ...t, predecessors: t.predecessors.filter(p => !removeIds.has(p)) };
        });
    });
    closeTask();
  };

  // Resource open/close — same auto-cleanup pattern as tasks
  const openResource = (id) => setOpenResourceId(id);
  const closeResource = () => {
    setOpenResourceId(id => {
      if (id && id.startsWith("nr")) {
        const r = (window.RESOURCES || []).find(x => x.id === id);
        if (r && !r.name?.trim()) setResources(prev => prev.filter(x => x.id !== id));
      }
      return null;
    });
  };
  const openCreateResource = () => {
    const newId = "nr" + Math.random().toString(36).slice(2, 7);
    setResources(prev => {
      const usedColors = new Set(prev.map(r => r.color));
      const color = RESOURCE_COLORS.find(c => !usedColors.has(c)) || RESOURCE_COLORS[0];
      return [...prev, { id: newId, name: "", enName: "", role: "", color, capacity: 1.0, allocation: 0 }];
    });
    setOpenResourceId(newId);
  };
  const deleteResource = (id) => {
    // Also unassign from any task currently referencing this resource.
    setTasks(prev => prev.map(t => {
      const next = { ...t };
      if (t.owner === id) next.owner = undefined;
      if ((t.subs || []).includes(id)) next.subs = t.subs.filter(s => s !== id);
      return next;
    }));
    setResources(prev => prev.filter(x => x.id !== id));
    closeResource();
  };

  // ─── Project drawer (create / edit) ───
  const openProject = (id) => setOpenProjectId(id);
  const closeProject = () => {
    setOpenProjectId(id => {
      // Auto-cleanup new empty projects (id starts with "np")
      if (id && id.startsWith("np")) {
        const p = (window.PROJECTS || []).find(x => x.id === id);
        if (p && !p.name?.trim()) {
          setProjects(prev => prev.filter(x => x.id !== id));
        }
      }
      return null;
    });
  };
  const openCreateProject = () => {
    const newId = "np" + Math.random().toString(36).slice(2, 7);
    setProjects(prev => [
      ...prev,
      {
        id: newId, name: "", client: "", description: "",
        startDate: TODAY, endDate: TODAY, baselineEnd: TODAY,
        progress: 0, health: "on-track", members: 0,
      },
    ]);
    setOpenProjectId(newId);
  };
  const handleDeleteProject = (id) => {
    deleteProject(id);
    closeProject();
  };
  const handleSwitchProject = (id) => {
    switchToProject(id);
    setShowProjectsList(false);
  };

  // ─── Confirmation wrappers for destructive actions ───
  // These are passed to drawers/menus instead of the raw delete functions.
  // Each surfaces blast radius (cascade impact) so the user can decide knowingly.

  const askDeleteTask = (id) => {
    const t = (window.TASKS || []).find(x => x.id === id);
    if (!t) return;
    const successors = (window.TASKS || []).filter(x => (x.predecessors || []).includes(id));
    const children = t.isPhase ? (window.TASKS || []).filter(x => x.parent === id) : [];
    askConfirm({
      title: t.isPhase ? "フェーズを削除しますか？" : "タスクを削除しますか？",
      body: (
        <>
          <p>「<strong>{t.name || "(名称未設定)"}</strong>」を削除します。</p>
          {children.length > 0 && (
            <p className="pw-confirm__warn">
              ⚠️ 配下の子タスク <strong>{children.length} 件</strong> も同時に削除されます。
            </p>
          )}
          {successors.length > 0 && (
            <p className="pw-confirm__warn">
              このタスクを先行とする <strong>{successors.length} 件</strong> のタスクから先行リンクが切れます。
            </p>
          )}
        </>
      ),
      confirmLabel: t.isPhase ? "フェーズごと削除" : "削除",
      destructive: true,
      onConfirm: () => { deleteTask(id); closeConfirm(); },
    });
  };

  const askDeleteResource = (id) => {
    const r = (window.RESOURCES || []).find(x => x.id === id);
    if (!r) return;
    const owned = (window.TASKS || []).filter(t => t.owner === id);
    const subs = (window.TASKS || []).filter(t => (t.subs || []).includes(id));
    const total = owned.length + subs.length;
    askConfirm({
      title: "メンバーを削除しますか？",
      body: (
        <>
          <p>「<strong>{r.name || "(名称未設定)"}</strong>」を削除します。</p>
          {total === 0 ? (
            <p>アサイン中のタスクはありません。</p>
          ) : (
            <p className="pw-confirm__warn">
              ⚠️ 主担当 <strong>{owned.length} 件</strong> ／ 副担当 <strong>{subs.length} 件</strong>
              のタスクから自動的にアンアサインされます。
            </p>
          )}
        </>
      ),
      confirmLabel: "削除",
      destructive: true,
      onConfirm: () => { deleteResource(id); closeConfirm(); },
    });
  };

  const askDeleteComment = (id) => {
    const c = (window.COMMENTS || []).find(x => x.id === id);
    if (!c) return;
    askConfirm({
      title: "コメントを削除しますか？",
      body: (
        <>
          <p>この操作は取り消せません。</p>
          <p className="pw-confirm__warn">
            「{c.body.length > 60 ? c.body.slice(0, 60) + "…" : c.body}」
          </p>
        </>
      ),
      confirmLabel: "削除",
      destructive: true,
      onConfirm: () => { deleteComment(id); closeConfirm(); },
    });
  };

  const askDeleteProject = (id) => {
    const p = (window.PROJECTS || []).find(x => x.id === id);
    if (!p) return;
    const remaining = (window.PROJECTS || []).filter(x => x.id !== id).length;
    askConfirm({
      title: "プロジェクトを削除しますか？",
      body: (
        <>
          <p>「<strong>{p.name || "(名称未設定)"}</strong>」を削除します。</p>
          {p.current && remaining > 0 && (
            <p className="pw-confirm__warn">
              ⚠️ 現在表示中のプロジェクトです。削除後は別のプロジェクトに自動切替されます。
            </p>
          )}
          {remaining === 0 && (
            <p className="pw-confirm__warn">
              ⚠️ これが最後のプロジェクトです。削除後はプロジェクトが1つも無い状態になります。
            </p>
          )}
        </>
      ),
      confirmLabel: "プロジェクトを削除",
      destructive: true,
      onConfirm: () => { handleDeleteProject(id); closeConfirm(); },
    });
  };

  return (
    <div className={"pw-app" + (t.sidebarCollapsed ? " pw-app--collapsed" : "")}
         data-screen-label="ProjectWeb">
      <Sidebar
        nav={NAV}
        active={showProjectsList ? null : view}
        onNav={(id) => { setView(id); setShowProjectsList(false); closeTask(); }}
        collapsed={t.sidebarCollapsed}
        onToggle={() => setTweak("sidebarCollapsed", !t.sidebarCollapsed)}
        showProjectsList={showProjectsList}
        onShowProjectsList={() => { setShowProjectsList(true); closeTask(); }}
      />
      <main className="pw-main">
        <Topbar
          view={showProjectsList ? "projects" : view}
          onToggleSidebar={() => setTweak("sidebarCollapsed", !t.sidebarCollapsed)}
          onProjectsClick={() => setShowProjectsList(true)}
          onProjectClick={() => setShowProjectsList(false)}
        />
        <div className={"pw-main__body" + (!showProjectsList && view === "dashboard" ? " pw-main__body--dash" : "")} data-screen-label={
          showProjectsList ? "Projects" :
          view === "dashboard" ? "Dashboard" :
          view === "gantt" ? "Gantt" :
          view === "resources" ? "Resources" : view
        }>
          {showProjectsList && (
            <ProjectsListScreen
              onSwitchProject={handleSwitchProject}
              onEditProject={openProject}
              onCreateProject={openCreateProject}/>
          )}
          {!showProjectsList && view === "dashboard" && <DashboardScreen onOpenTask={openTask} onOpenResource={openResource}/>}
          {!showProjectsList && view === "table" &&     <TableScreen onOpenTask={openTask} onCreateTask={openCreate} askDeleteTask={askDeleteTask}/>}
          {!showProjectsList && view === "gantt" &&     <GanttScreen tweaks={tweaks} onOpenTask={openTask} onCreateTask={openCreate} selectedId={openTaskId}/>}
          {!showProjectsList && view === "resources" && <ResourcesScreen onOpenTask={openTask} onOpenResource={openResource} onCreateResource={openCreateResource}/>}
        </div>
      </main>

      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          scrollTo={openTaskScrollTo}
          scrollToCommentId={openTaskCommentId}
          onClose={closeTask}
          onDelete={askDeleteTask}
          askDeleteComment={askDeleteComment}/>
      )}
      {openResourceId && (
        <ResourceDrawer resourceId={openResourceId} onClose={closeResource} onDelete={askDeleteResource}
          onOpenTask={(id) => { closeResource(); openTask(id); }}/>
      )}
      {openProjectId && (
        <ProjectDrawer projectId={openProjectId}
          onClose={closeProject}
          onDelete={askDeleteProject}
          onSwitchTo={(id) => { closeProject(); handleSwitchProject(id); }}/>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={closeConfirm}/>}

      <ProjectWebTweaks t={t} setTweak={setTweak}/>
    </div>
  );
}

// ─────────── Sidebar ───────────
function Sidebar({ nav, active, onNav, collapsed, onToggle, showProjectsList, onShowProjectsList }) {
  return (
    <aside className="pw-sidebar">
      <div className="pw-sidebar__brand">
        {/* When collapsed, the brand mark itself becomes the toggle (no
            separate button — there's not enough room in 56px). When
            expanded, the toggle stays at the right edge. */}
        <button
          type="button"
          className="pw-brand"
          onClick={collapsed ? onToggle : undefined}
          title={collapsed ? "サイドバーを開く" : undefined}>
          <div className="pw-brand__mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="6"  width="11" height="3" rx="1.5" fill="currentColor"/>
              <rect x="6" y="11" width="13" height="3" rx="1.5" fill="currentColor" opacity="0.65"/>
              <rect x="4" y="16" width="9"  height="3" rx="1.5" fill="currentColor" opacity="0.4"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="pw-brand__text">
              <div className="pw-brand__name">ProjectWeb</div>
              <div className="pw-brand__sub">Acme Inc.</div>
            </div>
          )}
        </button>
        {!collapsed && (
          <button className="pw-icon-btn pw-sidebar__toggle" onClick={onToggle} title="サイドバーを閉じる">
            <Icon name="sidebar" size={16}/>
          </button>
        )}
      </div>

      <button className="pw-project-switch" onClick={onShowProjectsList}>
        {!collapsed ? (
          <>
            <div className="pw-project-switch__icon"><Icon name="folder" size={14}/></div>
            <div className="pw-project-switch__body">
              <div className="pw-project-switch__label">プロジェクト</div>
              <div className="pw-project-switch__name">{PROJECT.name}</div>
            </div>
            <Icon name="chevronD" size={14}/>
          </>
        ) : (
          <div className="pw-project-switch__icon"><Icon name="folder" size={14}/></div>
        )}
      </button>

      <nav className="pw-nav">
        {nav.map(n => (
          <button key={n.id} className={"pw-nav__item" + (active === n.id ? " pw-nav__item--active" : "")} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={16}/>
            {!collapsed && <span>{n.label}</span>}
          </button>
        ))}
      </nav>

      <div className="pw-sidebar__foot">
        <button className="pw-nav__item">
          <Icon name="settings" size={16}/>
          {!collapsed && <span>設定</span>}
        </button>
        {!collapsed && (
          <div className="pw-sidebar__user">
            <Avatar resource={RESOURCES[0]} size={28}/>
            <div>
              <div className="pw-sidebar__user-name">{RESOURCES[0].name}</div>
              <div className="pw-sidebar__user-role">{RESOURCES[0].role}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─────────── Topbar ───────────
function Topbar({ view, onToggleSidebar, onProjectsClick, onProjectClick }) {
  const titles = {
    "projects":  "プロジェクト",
    "dashboard": "ダッシュボード",
    "table":     "テーブル",
    "gantt":     "ガントチャート",
    "resources": "リソース管理",
  };
  return (
    <header className="pw-topbar">
      <div className="pw-topbar__left">
        <div className="pw-crumbs">
          <button className="pw-crumbs__item" onClick={onProjectsClick}>すべてのプロジェクト</button>
          <Icon name="chevronR" size={12}/>
          {view !== "projects" && (
            <>
              <button className="pw-crumbs__item" onClick={onProjectClick}>{PROJECT.name}</button>
              <Icon name="chevronR" size={12}/>
            </>
          )}
          <span className="pw-crumbs__current">{titles[view]}</span>
        </div>
      </div>
      <div className="pw-topbar__right">
        <div className="pw-search">
          <Icon name="search" size={14}/>
          <input className="pw-search__input" placeholder="プロジェクト全体を検索…"/>
          <kbd className="pw-kbd">⌘K</kbd>
        </div>
        <button className="pw-icon-btn" title="プロジェクトを共有">
          <Icon name="upload" size={16}/>
        </button>
        <button className="pw-icon-btn pw-icon-btn--badge" title="通知">
          <Icon name="bell" size={16}/>
          <span className="pw-badge"/>
        </button>
        <span className="pw-divider-v"/>
        <div className="pw-topbar__avatars">
          <AvatarStack ids={RESOURCES.slice(0,4).map(r=>r.id)} size={26}/>
        </div>
      </div>
    </header>
  );
}

// ─────────── Tweaks panel ───────────
function ProjectWebTweaks({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="カラー">
        <TweakColor label="プライマリ" value={t.primaryColor}
          onChange={(v) => setTweak("primaryColor", v)}
          options={["#3D6BE0", "#7C5CFA", "#2A8C6E", "#E0708A", "#1F1F1E", "#C57F1A"]}/>
      </TweakSection>
      <TweakSection label="情報密度">
        <TweakRadio label="表示" value={t.density}
          onChange={(v) => setTweak("density", v)}
          options={[
            { value: "compact", label: "コンパクト" },
            { value: "comfortable", label: "標準" },
            { value: "spacious", label: "ゆったり" },
          ]}/>
      </TweakSection>
      <TweakSection label="ガントチャート">
        <TweakRadio label="ズーム" value={t.ganttZoom}
          onChange={(v) => setTweak("ganttZoom", v)}
          options={[
            { value: "day",     label: "日" },
            { value: "week",    label: "週" },
            { value: "month",   label: "月" },
            { value: "quarter", label: "四半期" },
          ]}/>
      </TweakSection>
      <TweakSection label="サイドバー">
        <TweakToggle label="折りたたみ" value={t.sidebarCollapsed}
          onChange={(v) => setTweak("sidebarCollapsed", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

// ─────────── helpers ───────────
function hexToRgb(hex) {
  const m = hex.replace("#","").match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
