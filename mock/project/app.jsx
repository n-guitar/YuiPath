// App shell — sidebar nav + topbar + content router

const NAV = [
  { id: "dashboard", label: "ダッシュボード", icon: "home" },
  { id: "table",     label: "テーブル",       icon: "table" },
  { id: "gantt",     label: "ガントチャート",  icon: "gantt" },
  { id: "calendar",  label: "カレンダー",     icon: "calendar" },
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
    "sidebarCollapsed": false,
    "theme": "auto"
  }/*EDITMODE-END*/);
  const tweaks = { t, setTweak, ganttZoom: t.ganttZoom };

  // Resolve "auto" to the OS preference, and react when it changes.
  // `effectiveTheme` is what we actually paint ("light" or "dark").
  const [systemDark, setSystemDark] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false);
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const effectiveTheme = t.theme === "dark" ? "dark"
                       : t.theme === "light" ? "light"
                       : (systemDark ? "dark" : "light");

  // Apply theme + density + accent vars. Dark mode bumps the accent-soft
  // alpha so the tinted backgrounds (filter chips, hover states) keep
  // their visual presence on a dark surface.
  React.useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--accent", t.primaryColor);
    const rgb = hexToRgb(t.primaryColor);
    if (rgb) {
      const a1 = effectiveTheme === "dark" ? 0.18 : 0.10;
      const a2 = effectiveTheme === "dark" ? 0.30 : 0.18;
      document.documentElement.style.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a1})`);
      document.documentElement.style.setProperty("--accent-soft-2", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a2})`);
    }
  }, [t.primaryColor, t.density, effectiveTheme]);

  // null = signed in. Otherwise one of "login" | "signup" | "forgot".
  // Default starts signed-in so the demo lands on the work surface.
  const [authView, setAuthView] = React.useState(null);
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
    // Self-delete is blocked. Convention: an account cannot delete itself
    // through the in-app UI — it would orphan the session. Show a notice.
    if (id === CURRENT_USER_ID) {
      askConfirm({
        title: "ご自身は削除できません",
        body: <p>ログイン中のアカウントを自分自身で削除することはできません。アカウントを完全に削除するには、ログアウト後に管理者へ依頼してください。</p>,
        confirmLabel: "OK",
        onConfirm: () => closeConfirm(),
      });
      return;
    }
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

  const askDeleteCalendar = (id) => {
    const c = (window.CALENDARS || []).find(x => x.id === id);
    if (!c) return;
    const usedBy = (window.PROJECTS || []).filter(p => p.calendarId === id).length;
    askConfirm({
      title: "カレンダーを削除しますか？",
      body: (
        <>
          <p>「<strong>{c.name}</strong>」を削除します。</p>
          {usedBy > 0 ? (
            <p className="pw-confirm__warn">
              ⚠️ {usedBy} プロジェクトで使用中です。先に各プロジェクトのカレンダーを別のものに変更してください。
            </p>
          ) : (
            <p>このカレンダーはどのプロジェクトでも使われていません。安全に削除できます。</p>
          )}
        </>
      ),
      confirmLabel: usedBy > 0 ? "削除できません" : "削除",
      destructive: true,
      onConfirm: () => {
        if (usedBy > 0) { closeConfirm(); return; }
        deleteCalendar(id);
        closeConfirm();
      },
    });
  };

  const askDeleteHoliday = (calendarId, date) => {
    const c = (window.CALENDARS || []).find(x => x.id === calendarId);
    if (!c) return;
    const h = (c.holidays || []).find(x => x.date === date);
    if (!h) return;
    const usedBy = (window.PROJECTS || []).filter(p => p.calendarId === calendarId).length;
    askConfirm({
      title: "祝日を削除しますか？",
      body: (
        <>
          <p>「<strong>{h.name}</strong>」（{h.date}）を「{c.name}」から削除します。</p>
          {usedBy > 0 && (
            <p className="pw-confirm__warn">
              ⚠️ このカレンダーは <strong>{usedBy} プロジェクト</strong>で使用中です。
              削除すると、その日が稼働日扱いとなり、今後のタスク日数計算に影響します。
            </p>
          )}
        </>
      ),
      confirmLabel: "削除",
      destructive: true,
      onConfirm: () => {
        updateCalendar(calendarId, {
          holidays: (c.holidays || []).filter(x => x.date !== date),
        });
        closeConfirm();
      },
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

  if (authView) {
    return (
      <AuthShell
        view={authView}
        onView={setAuthView}
        onAuthenticated={() => setAuthView(null)}/>
    );
  }

  return (
    <div className={"pw-app" + (t.sidebarCollapsed ? " pw-app--collapsed" : "")}
         data-screen-label="YuiPath">
      <Sidebar
        nav={NAV}
        active={showProjectsList ? null : view}
        onNav={(id) => { setView(id); setShowProjectsList(false); closeTask(); }}
        collapsed={t.sidebarCollapsed}
        onToggle={() => setTweak("sidebarCollapsed", !t.sidebarCollapsed)}
        showProjectsList={showProjectsList}
        onShowProjectsList={() => { setShowProjectsList(true); closeTask(); }}
        onSwitchProject={handleSwitchProject}
        onCreateProject={openCreateProject}
        onOpenSettings={() => { setView("settings"); setShowProjectsList(false); closeTask(); }}
        onOpenProfile={() => { closeTask(); openResource(CURRENT_USER_ID); }}
        theme={t.theme || "auto"}
        onThemeChange={(v) => setTweak("theme", v)}
        onLogout={() => askConfirm({
          title: "ログアウトしますか？",
          body: <p>このセッションを終了します。未保存の変更は失われる可能性があります。</p>,
          confirmLabel: "ログアウト",
          destructive: true,
          onConfirm: () => { closeConfirm(); setAuthView("login"); },
        })}
      />
      <main className="pw-main">
        <Topbar
          view={showProjectsList ? "projects" : view}
          onToggleSidebar={() => setTweak("sidebarCollapsed", !t.sidebarCollapsed)}
          onProjectsClick={() => setShowProjectsList(true)}
          onProjectClick={() => setShowProjectsList(false)}
          onOpenTask={openTask}
          onOpenResource={openResource}
          onSwitchProject={handleSwitchProject}
        />
        <div className={"pw-main__body" + (!showProjectsList && view === "dashboard" ? " pw-main__body--dash" : "")} data-screen-label={
          showProjectsList ? "Projects" :
          view === "dashboard" ? "Dashboard" :
          view === "gantt" ? "Gantt" :
          view === "calendar" ? "Calendar" :
          view === "settings" ? "Settings" :
          view === "resources" ? "Resources" : view
        }>
          {showProjectsList && (
            <ProjectsListScreen
              onSwitchProject={handleSwitchProject}
              onEditProject={openProject}
              onCreateProject={openCreateProject}/>
          )}
          {!showProjectsList && view === "dashboard" && <DashboardScreen onOpenTask={openTask} onOpenResource={openResource} onCreateTask={openCreate} onGoView={setView}/>}
          {!showProjectsList && view === "table" &&     <TableScreen onOpenTask={openTask} onCreateTask={openCreate} askDeleteTask={askDeleteTask} askConfirm={askConfirm} closeConfirm={closeConfirm}/>}
          {!showProjectsList && view === "gantt" &&     <GanttScreen tweaks={tweaks} onOpenTask={openTask} onCreateTask={openCreate} selectedId={openTaskId}/>}
          {!showProjectsList && view === "calendar" &&  <CalendarScreen onOpenTask={openTask}/>}
          {!showProjectsList && view === "settings" &&  <SettingsScreen askDeleteCalendar={askDeleteCalendar} askDeleteHoliday={askDeleteHoliday}/>}
          {!showProjectsList && view === "resources" && <ResourcesScreen onOpenTask={openTask} onOpenResource={openResource} onCreateResource={openCreateResource} askDeleteResource={askDeleteResource}/>}
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
          onSwitchTo={(id) => { closeProject(); handleSwitchProject(id); }}
          onOpenSettings={() => { closeProject(); setShowProjectsList(false); setView("settings"); }}/>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={closeConfirm}/>}

      <YuiPathTweaks t={t} setTweak={setTweak}/>
    </div>
  );
}

// ─────────── Sidebar ───────────
function Sidebar({ nav, active, onNav, collapsed, onToggle, showProjectsList, onShowProjectsList, onSwitchProject, onCreateProject, onOpenSettings, onOpenProfile, theme, onThemeChange, onLogout }) {
  const projects = useProjects();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const switchRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (switchRef.current && !switchRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSwitchClick = () => {
    if (collapsed) onShowProjectsList();
    else setMenuOpen(o => !o);
  };
  const handlePick = (id) => {
    onSwitchProject(id);
    setMenuOpen(false);
  };
  const handleShowAll = () => { setMenuOpen(false); onShowProjectsList(); };
  const handleNew = () => { setMenuOpen(false); onCreateProject(); };

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
          <YuiPathMark size={collapsed ? 28 : 36}/>
          {!collapsed && <YuiPathWordmark height={26}/>}
        </button>
        {!collapsed && (
          <button className="pw-icon-btn pw-sidebar__toggle" onClick={onToggle} title="サイドバーを閉じる">
            <Icon name="sidebar" size={16}/>
          </button>
        )}
      </div>

      <div className="pw-project-switch-wrap" ref={switchRef}>
        <button
          className={"pw-project-switch" + (menuOpen ? " is-open" : "")}
          onClick={handleSwitchClick}>
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
            <div className="pw-project-switch__icon" title={`プロジェクト: ${PROJECT.name}`}><Icon name="folder" size={16}/></div>
          )}
        </button>
        {menuOpen && !collapsed && (
          <div className="pw-project-menu" role="menu">
            <div className="pw-project-menu__head">プロジェクトに切替</div>
            <div className="pw-project-menu__list">
              {projects.map(p => (
                <button key={p.id}
                  className={"pw-project-menu__item" + (p.current ? " is-current" : "")}
                  onClick={() => handlePick(p.id)}>
                  <span className="pw-project-menu__check">
                    {p.current && <Icon name="check" size={12}/>}
                  </span>
                  <span className="pw-project-menu__name">{p.name || "(名称未設定)"}</span>
                </button>
              ))}
            </div>
            <div className="pw-project-menu__divider"/>
            <button className="pw-project-menu__action" onClick={handleNew}>
              <Icon name="plus" size={12}/>
              <span>新規プロジェクト</span>
            </button>
            <button className="pw-project-menu__action" onClick={handleShowAll}>
              <Icon name="folder" size={12}/>
              <span>すべてのプロジェクトを表示</span>
              <Icon name="chevronR" size={11}/>
            </button>
          </div>
        )}
      </div>

      <nav className="pw-nav">
        {nav.map(n => (
          <button key={n.id} className={"pw-nav__item" + (active === n.id ? " pw-nav__item--active" : "")} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={16}/>
            {!collapsed && <span>{n.label}</span>}
          </button>
        ))}
      </nav>

      <div className="pw-sidebar__foot">
        <button
          className={"pw-nav__item" + (active === "settings" ? " pw-nav__item--active" : "")}
          onClick={onOpenSettings}>
          <Icon name="settings" size={16}/>
          {!collapsed && <span>設定</span>}
        </button>
        <UserMenu
          collapsed={collapsed}
          onOpenProfile={onOpenProfile}
          theme={theme}
          onThemeChange={onThemeChange}
          onLogout={onLogout}/>
      </div>
    </aside>
  );
}

// ─────────── UserMenu (sidebar foot) ───────────
function UserMenu({ collapsed, onOpenProfile, theme, onThemeChange, onLogout }) {
  // Subscribe so the menu re-renders when resources change. The current
  // user could have been deleted (mock doesn't truly prevent it, but we
  // try to — see askDeleteResource); fall back to a generic placeholder
  // rather than crash.
  const resources = useResources();
  const me = resources.find(r => r.id === CURRENT_USER_ID)
    || resources[0]
    || { id: "_none", name: "ゲスト", enName: "guest", role: "—", color: "#8C8B85" };
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (fn) => () => { setOpen(false); fn?.(); };

  return (
    <div className="pw-user-menu-wrap" ref={ref}>
      <button
        className={"pw-sidebar__user pw-sidebar__user--btn" + (collapsed ? " pw-sidebar__user--collapsed" : "") + (open ? " is-open" : "")}
        onClick={() => setOpen(o => !o)}
        title={collapsed ? `${me.name} · ${me.role}` : "アカウントメニュー"}>
        <Avatar resource={me} size={28}/>
        {!collapsed && (
          <>
            <div className="pw-sidebar__user-text">
              <div className="pw-sidebar__user-name">{me.name}</div>
              <div className="pw-sidebar__user-role">{me.role}</div>
            </div>
            <Icon name="chevronD" size={12}/>
          </>
        )}
      </button>
      {open && (
        <div className={"pw-user-menu" + (collapsed ? " pw-user-menu--collapsed" : "")} role="menu">
          <div className="pw-user-menu__head">
            <Avatar resource={me} size={32}/>
            <div className="pw-user-menu__head-text">
              <div className="pw-user-menu__name">{me.name}</div>
              <div className="pw-user-menu__email">{(me.enName || me.name).toLowerCase().replace(/\s+/g, ".")}@example.com</div>
            </div>
          </div>
          <div className="pw-user-menu__divider"/>
          <button className="pw-user-menu__item" onClick={pick(onOpenProfile)}>
            <Icon name="users" size={14}/>
            <span>プロフィール</span>
          </button>
          {onThemeChange && (
            <div className="pw-user-menu__theme">
              <span className="pw-user-menu__theme-label">テーマ</span>
              <div className="pw-seg" role="group" aria-label="テーマ">
                {[
                  { value: "auto",  label: "自動", icon: "settings" },
                  { value: "light", label: "ライト", icon: "sun" },
                  { value: "dark",  label: "ダーク", icon: "moon" },
                ].map(opt => (
                  <button key={opt.value}
                    className={"pw-seg__btn" + ((theme || "auto") === opt.value ? " is-active" : "")}
                    onClick={() => onThemeChange(opt.value)}
                    title={opt.label}
                    type="button">
                    <Icon name={opt.icon} size={13}/>
                    <span className="pw-seg__btn-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="pw-user-menu__divider"/>
          <button className="pw-user-menu__item pw-user-menu__item--danger" onClick={pick(onLogout)}>
            <Icon name="close" size={14}/>
            <span>ログアウト</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────── Topbar ───────────
function Topbar({ view, onToggleSidebar, onProjectsClick, onProjectClick, onOpenTask, onOpenResource, onSwitchProject }) {
  const titles = {
    "projects":  "プロジェクト",
    "dashboard": "ダッシュボード",
    "table":     "テーブル",
    "gantt":     "ガントチャート",
    "calendar":  "カレンダー",
    "resources": "リソース管理",
    "settings":  "設定",
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
        <SearchOmnibox onOpenTask={onOpenTask} onOpenResource={onOpenResource} onSwitchProject={onSwitchProject}/>
        <NotificationsButton onOpenTask={onOpenTask}/>
        <span className="pw-divider-v"/>
        <MembersButton onOpenResource={onOpenResource}/>
      </div>
    </header>
  );
}

// ─────────── SearchOmnibox (⌘K) ───────────
function SearchOmnibox({ onOpenTask, onOpenResource, onSwitchProject }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ql = q.trim().toLowerCase();
  const tasks = ql
    ? (window.TASKS || []).filter(t => t.name?.toLowerCase().includes(ql)).slice(0, 6)
    : [];
  const projects = ql
    ? (window.PROJECTS || []).filter(p => (p.name || "").toLowerCase().includes(ql) || (p.client || "").toLowerCase().includes(ql)).slice(0, 4)
    : [];
  const resources = ql
    ? (window.RESOURCES || []).filter(r =>
        (r.name || "").toLowerCase().includes(ql) ||
        (r.enName || "").toLowerCase().includes(ql) ||
        (r.role || "").toLowerCase().includes(ql)
      ).slice(0, 4)
    : [];
  const total = tasks.length + projects.length + resources.length;

  const close = () => { setOpen(false); setQ(""); };
  const pickTask = (id) => { close(); onOpenTask?.(id); };
  const pickResource = (id) => { close(); onOpenResource?.(id); };
  const pickProject = (id) => { close(); onSwitchProject?.(id); };

  return (
    <div className="pw-search-wrap" ref={ref}>
      <div className="pw-search">
        <Icon name="search" size={14}/>
        <input
          ref={inputRef}
          className="pw-search__input"
          placeholder="タスク・プロジェクト・メンバーを検索…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}/>
        <kbd className="pw-kbd">⌘K</kbd>
      </div>
      {open && (
        <div className="pw-omnibox" role="listbox">
          {!ql ? (
            <div className="pw-omnibox__hint">
              タスク名・プロジェクト名・メンバー名で横断検索
            </div>
          ) : total === 0 ? (
            <div className="pw-omnibox__empty">「{q}」に一致する項目はありません</div>
          ) : (
            <>
              {tasks.length > 0 && (
                <div className="pw-omnibox__group">
                  <div className="pw-omnibox__group-head">タスク</div>
                  {tasks.map(t => {
                    const owner = (window.RESOURCES || []).find(r => r.id === t.owner);
                    return (
                      <button key={t.id} className="pw-omnibox__item" onClick={() => pickTask(t.id)}>
                        <Icon name={t.isPhase ? "folder" : (t.milestone ? "flagSm" : "check")} size={13}/>
                        <span className="pw-omnibox__item-name">{t.name || "(名称未設定)"}</span>
                        <span className="pw-omnibox__item-meta">
                          {fmtJP(t.start)}–{fmtJP(t.end)}
                          {owner && <> · {owner.name}</>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {projects.length > 0 && (
                <div className="pw-omnibox__group">
                  <div className="pw-omnibox__group-head">プロジェクト</div>
                  {projects.map(p => (
                    <button key={p.id} className="pw-omnibox__item" onClick={() => pickProject(p.id)}>
                      <Icon name="folder" size={13}/>
                      <span className="pw-omnibox__item-name">{p.name || "(名称未設定)"}</span>
                      {p.current && <span className="pw-omnibox__badge">現在</span>}
                    </button>
                  ))}
                </div>
              )}
              {resources.length > 0 && (
                <div className="pw-omnibox__group">
                  <div className="pw-omnibox__group-head">メンバー</div>
                  {resources.map(r => (
                    <button key={r.id} className="pw-omnibox__item" onClick={() => pickResource(r.id)}>
                      <Avatar resource={r} size={18}/>
                      <span className="pw-omnibox__item-name">{r.name}</span>
                      <span className="pw-omnibox__item-meta">{r.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────── NotificationsButton ───────────
function NotificationsButton({ onOpenTask }) {
  // Subscribe so unread state recomputes when comments change.
  useComments();
  const [open, setOpen] = React.useState(false);
  // Track ids the user has dismissed in this session — there is no real
  // server-side "read" state in the mock.
  const [readIds, setReadIds] = React.useState(() => new Set());
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const notifs = buildNotifications();
  const unreadCount = notifs.filter(n => !readIds.has(n.id)).length;

  const pick = (n) => {
    setReadIds(prev => new Set(prev).add(n.id));
    setOpen(false);
    if (n.taskId) onOpenTask?.(n.taskId);
  };
  const markAllRead = () => setReadIds(new Set(notifs.map(n => n.id)));

  return (
    <div className="pw-notif-wrap" ref={ref}>
      <button
        className={"pw-icon-btn" + (unreadCount > 0 ? " pw-icon-btn--badge" : "")}
        onClick={() => setOpen(o => !o)}
        title="通知">
        <Icon name="bell" size={16}/>
        {unreadCount > 0 && <span className="pw-badge"/>}
      </button>
      {open && (
        <div className="pw-notif">
          <div className="pw-notif__head">
            <span className="pw-notif__title">通知</span>
            {unreadCount > 0 && (
              <button className="pw-notif__mark" onClick={markAllRead}>すべて既読</button>
            )}
          </div>
          {notifs.length === 0 ? (
            <div className="pw-notif__empty">新しい通知はありません</div>
          ) : (
            <div className="pw-notif__list">
              {notifs.map(n => {
                const unread = !readIds.has(n.id);
                return (
                  <button key={n.id}
                    className={"pw-notif__item" + (unread ? " is-unread" : "")}
                    onClick={() => pick(n)}>
                    <span className="pw-notif__dot" aria-hidden="true"/>
                    <Avatar resource={(window.RESOURCES || []).find(r => r.id === n.who)} size={24}/>
                    <div className="pw-notif__body">
                      <div className="pw-notif__text">{n.text}</div>
                      <div className="pw-notif__time">{n.time}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Synthesize notifications for the mock — derive from comments (recent
// comments by anyone other than CURRENT_USER mention "you should look")
// and ACTIVITY entries that affect tasks where CURRENT_USER is owner.
function buildNotifications() {
  const me = CURRENT_USER_ID;
  const comments = window.COMMENTS || [];
  const tasks = window.TASKS || [];

  const fromComments = comments
    .filter(c => c.authorId !== me)
    .slice(-5)
    .reverse()
    .map(c => {
      const t = tasks.find(x => x.id === c.taskId);
      const isMine = t && (t.owner === me || (t.subs || []).includes(me));
      return {
        id: "n-c-" + c.id,
        who: c.authorId,
        text: `${isMine ? "あなたのタスク" : ""}「${t?.name || "(タスク)"}」にコメント`,
        time: fmtRelativeTime(c.createdAt),
        taskId: c.taskId,
        priority: isMine ? 1 : 2,
      };
    });

  const fromActivity = (window.ACTIVITY || [])
    .filter(a => a.who !== me)
    .slice(0, 3)
    .map(a => ({
      id: "n-a-" + a.id,
      who: a.who,
      text: a.text,
      time: a.time,
      taskId: a.taskId,
      priority: 3,
    }));

  return [...fromComments, ...fromActivity].sort((a, b) => a.priority - b.priority);
}

// ─────────── MembersButton ───────────
function MembersButton({ onOpenResource }) {
  const resources = useResources();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pw-members-wrap" ref={ref}>
      <button
        className={"pw-members__trigger" + (open ? " is-open" : "")}
        onClick={() => setOpen(o => !o)}
        title="プロジェクトメンバー">
        <AvatarStack ids={resources.slice(0, 4).map(r => r.id)} size={26}/>
      </button>
      {open && (
        <div className="pw-members">
          <div className="pw-members__head">
            <span>プロジェクトメンバー</span>
            <span className="pw-members__count">{resources.length}名</span>
          </div>
          <div className="pw-members__list">
            {resources.map(r => (
              <button key={r.id} className="pw-members__item"
                onClick={() => { setOpen(false); onOpenResource?.(r.id); }}>
                <Avatar resource={r} size={28}/>
                <div className="pw-members__text">
                  <div className="pw-members__name">{r.name}</div>
                  <div className="pw-members__role">{r.role}</div>
                </div>
                {r.id === CURRENT_USER_ID && (
                  <span className="pw-members__self">自分</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────── Tweaks panel ───────────
function YuiPathTweaks({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="テーマ">
        <TweakRadio label="モード" value={t.theme || "auto"}
          onChange={(v) => setTweak("theme", v)}
          options={[
            { value: "auto",  label: "自動" },
            { value: "light", label: "ライト" },
            { value: "dark",  label: "ダーク" },
          ]}/>
      </TweakSection>
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
