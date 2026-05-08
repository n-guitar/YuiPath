// App shell — sidebar nav + topbar + content router

const NAV = [
  { id: "dashboard", label: "ダッシュボード", icon: "home" },
  { id: "table",     label: "テーブル",       icon: "table" },
  { id: "gantt",     label: "ガントチャート",  icon: "gantt" },
  { id: "wbs",       label: "WBS",          icon: "tree" },
  { id: "resources", label: "リソース",       icon: "users" },
];

function App() {
  // Subscribe at the root so any task edit re-renders the whole tree (children read window.TASKS).
  useTasks();

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
  const [modal, setModal] = React.useState(null); // { mode: 'create'|'edit', taskId? }
  const [showProjectsList, setShowProjectsList] = React.useState(false);

  const openTask = (id) => setOpenTaskId(id);
  const closeTask = () => setOpenTaskId(null);
  const openCreate = () => setModal({ mode: "create" });
  const openEdit = (id) => setModal({ mode: "edit", taskId: id });
  const closeModal = () => setModal(null);

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
          onCreateTask={openCreate}
        />
        <div className={"pw-main__body" + (!showProjectsList && view === "dashboard" ? " pw-main__body--dash" : "")} data-screen-label={
          showProjectsList ? "Projects" :
          view === "dashboard" ? "Dashboard" :
          view === "gantt" ? "Gantt" :
          view === "wbs" ? "WBS" :
          view === "resources" ? "Resources" : view
        }>
          {showProjectsList && <ProjectsListScreen />}
          {!showProjectsList && view === "dashboard" && <DashboardScreen onOpenTask={openTask}/>}
          {!showProjectsList && view === "table" &&     <TableScreen onOpenTask={openTask} onCreateTask={openCreate}/>}
          {!showProjectsList && view === "gantt" &&     <GanttScreen tweaks={tweaks} onOpenTask={openTask} selectedId={openTaskId}/>}
          {!showProjectsList && view === "wbs" &&       <WbsScreen onOpenTask={openTask}/>}
          {!showProjectsList && view === "resources" && <ResourcesScreen onOpenTask={openTask}/>}
        </div>
      </main>

      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={closeTask} onEdit={() => { openEdit(openTaskId); closeTask(); }} />}

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.taskId ? TASKS.find(x => x.id === modal.taskId) : null}
          onClose={closeModal}
          onOpenTask={(id) => { closeModal(); openTask(id); }}
        />
      )}

      <ProjectWebTweaks t={t} setTweak={setTweak}/>
    </div>
  );
}

// ─────────── Sidebar ───────────
function Sidebar({ nav, active, onNav, collapsed, onToggle, showProjectsList, onShowProjectsList }) {
  return (
    <aside className="pw-sidebar">
      <div className="pw-sidebar__brand">
        <div className="pw-brand">
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
        </div>
        <button className="pw-icon-btn pw-sidebar__toggle" onClick={onToggle} title="サイドバーを切り替え">
          <Icon name="sidebar" size={16}/>
        </button>
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

      {!collapsed && (
        <div className="pw-sidebar__section">
          <div className="pw-sidebar__section-head">フェーズ</div>
          <div className="pw-sidebar__phases">
            {TASKS.filter(t => t.isPhase).map((p, i) => (
              <button key={p.id} className="pw-sidebar__phase">
                <span className="pw-sidebar__phase-num">{i+1}</span>
                <span className="pw-sidebar__phase-name">{p.name}</span>
                <span className="pw-sidebar__phase-pct">{Math.round(p.progress*100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="pw-sidebar__section">
          <div className="pw-sidebar__section-head">チーム</div>
          <div className="pw-sidebar__team">
            {RESOURCES.map(r => (
              <div key={r.id} className="pw-sidebar__member">
                <Avatar resource={r} size={20}/>
                <span className="pw-sidebar__member-name">{r.name}</span>
                {r.allocation > 1.0 && <span className="pw-sidebar__over">!</span>}
              </div>
            ))}
          </div>
        </div>
      )}

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
function Topbar({ view, onToggleSidebar, onProjectsClick, onProjectClick, onCreateTask }) {
  const titles = {
    "projects":  "プロジェクト",
    "dashboard": "ダッシュボード",
    "table":     "テーブル",
    "gantt":     "ガントチャート",
    "wbs":       "WBS",
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
          <input className="pw-search__input" placeholder="タスク・メンバーを検索…"/>
          <kbd className="pw-kbd">⌘K</kbd>
        </div>
        <button className="pw-icon-btn pw-icon-btn--badge" title="通知">
          <Icon name="bell" size={16}/>
          <span className="pw-badge"/>
        </button>
        <span className="pw-divider-v"/>
        <div className="pw-topbar__avatars">
          <AvatarStack ids={RESOURCES.slice(0,4).map(r=>r.id)} size={26}/>
        </div>
        <button className="pw-btn pw-btn--ghost"><Icon name="upload" size={14}/> 共有</button>
        {view !== "projects" && (
          <button className="pw-btn pw-btn--primary" onClick={onCreateTask}>
            <Icon name="plus" size={14}/> 新規タスク
          </button>
        )}
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
