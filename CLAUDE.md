# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

**YuiPath** — planned OSS project management tool (MS Project / ProjectLibre alternative). The full product hasn't been built yet. This repo currently contains:

- `mock/project/` — a fully-working **HTML/CSS/JS mock** that's the active design surface. All current iteration happens here.
- `docs/adr/` — Architecture Decision Records describing the planned product (Tauri + Rust + AWS, MCP for AI).
- `mock/chats/issue.md` — long-form transcripts of the original product planning (read this for full context on why design choices were made).

The mock is the prototype that defines the product's UX; the real implementation will be a separate codebase per ADR-0001 (Tauri 2.0 + React/TS frontend with shared Rust→WASM PM core, plus an AWS Pattern B with DynamoDB On-Demand).

## Running the mock

The mock is a static page that uses **babel-standalone** to transform JSX in the browser. There is no build step.

```bash
cd mock/project
python3 -m http.server 8731
# open http://localhost:8731/YuiPath.html
```

Hard-reload (`Cmd+Shift+R`) is needed when CSS or JSX changes don't appear — Babel-standalone doesn't always invalidate cleanly.

There are **no tests, no linter, no build pipeline**. Validation is by reloading the browser.

## Mock architecture

### Script load order matters

`mock/project/YuiPath.html` loads JSX files in this exact order via `<script type="text/babel">`:

```
data.jsx → primitives.jsx → pickers.jsx → tweaks-panel.jsx →
gantt.jsx → screens.jsx → table.jsx → calendar.jsx → auth.jsx → app.jsx
```

Each `.jsx` file runs in a shared global scope (no ES modules). Components/helpers are attached to `window` via `Object.assign(window, {...})` at the bottom. Function declarations are hoisted, so cross-file references work at render time even when the dependency is loaded later.

### State stores (data.jsx)

There are five subscribable stores: **tasks, resources, projects, comments, calendars**. All follow the same pattern:

```js
let _tasks = TASKS;
function setTasks(next) {
  const arr = typeof next === "function" ? next(_tasks) : next;
  _tasks = arr;                  // new array reference per update
  TASKS.length = 0; TASKS.push(...arr);   // ALSO mutate const in place
  window.TASKS = _tasks;
  _tasksSubs.forEach(cb => cb());
}
```

Why both? `useSyncExternalStore` needs a **new reference** to detect changes; bare reads of the const (e.g. `TASKS.find(...)` inside primitives) need the **mutated original** to see updates. Doing both keeps the system consistent.

`PROJECT` and `PROJECT_KPIS` are **Proxies** that resolve to the currently-active project (`window.PROJECTS.find(p => p.current)`) at access time. Existing code reading `PROJECT.startDate` keeps working without changes when projects switch.

The App root calls `useTasks() / useResources() / useProjects() / useCalendars()` so the entire tree re-renders on any mutation.

### View routing (app.jsx)

App holds a `view` string (`"dashboard" | "table" | "gantt" | "calendar" | "resources" | "settings"`) plus a `showProjectsList` boolean. Drawer state is also App-level (`openTaskId`, `openResourceId`, `openProjectId`).

Drawers are rendered as overlays at the App root, not inside their originating view. Each drawer subscribes to its store inside its component so live edits propagate without prop drilling.

### Confirmation dialogs

A single App-level `confirm` state drives the shared `ConfirmDialog`. Each destructive action has an `askDelete*(id)` wrapper that surfaces blast radius (cascade counts) and calls `askConfirm({...})`. Pattern is uniform across task / resource / project / comment / calendar / holiday deletes.

### Working-day arithmetic (primitives.jsx)

Calendar templates live in `CALENDARS`. Each project references one via `calendarId`. The helpers `isWorkingDay`, `workingDaysBetween`, `addWorkingDays` accept a calendar object, a legacy holidays array, or `undefined` (defaults to Mon-Fri).

When a task's `duration` (in working days) is edited, `end` is recomputed via `addWorkingDays(start, duration - 1, calendar)`. When dates are edited, `duration` is recomputed via `workingDaysBetween`. This logic lives in TaskDrawer and the table's inline editor.

### Status taxonomy

Tasks use a 7-state taxonomy defined in `STATUSES` ([data.jsx](mock/project/data.jsx)): `todo / started / in-progress-50 / in-progress-80 / review / done / blocked`. Each has `progress` mapping (used to drive the progress field automatically when status changes). Legacy `"in-progress"` is aliased to `in-progress-50` for backward compat with old data.

Bar colors in gantt and calendar views, status pills, and detector severity all derive from `STATUS_BY_VALUE`.

### Detector framework (screens.jsx)

The dashboard "要注意 (今)" panel is driven by an array `DETECTORS_NOW`. Each detector is a pure function `(ctx) => Array<{id, severity, ...}>`. Adding a new signal = write a function and append it. No other dashboard code changes needed.

`evaluateMilestones(ctx)` walks predecessor chains (1 level deep) for the "リスクのある先" panel.

### Pinned demo state

- `TODAY = "2026-06-12"` — used by detectors, today-marker in gantt/calendar, relative-time formatting
- `NOW = "2026-06-12T15:30:00"` — for `fmtRelativeTime` (comments / activity)
- `CURRENT_USER_ID = "r1"` — mock auth (田中 美咲)

Changing these shifts the entire demo's time horizon consistently.

## Conventions to know

- **CSS prefix**: every class starts with `pw-` (legacy from the original "ProjectWeb" working name; kept for now to avoid a massive churn — class names are not user-visible).
- **`* { box-sizing: border-box }`** is set globally — assume border-box everywhere.
- **`<button>` width gotcha**: `<button>` does NOT fill its parent even with `display: flex`. Always add `width: 100%; box-sizing: border-box;` explicitly when you need a button to fill width (sidebar nav items, project switcher, etc.). This was discovered the hard way — verify alignment with Chrome DevTools MCP if available.
- **Drawers replace modals**: TaskModal was deleted; all task/resource/project/comment editing happens inline in drawers. Drawer width is 640px.
- **No fake numbers**: EVM (SPI / CPI / EV / AC) was removed because the data model can't honestly support it. The dashboard surfaces only metrics derivable from real task data. Don't reintroduce vanity metrics without backing data.
- **Out of scope**: MS Project (MPP) compatibility was explicitly dropped (see ADR-0001). Only CSV import/export is supported.

## ADRs

When making architectural decisions, **read the relevant ADR first** and add a new one (or supersede an existing one) for any meaningful choice:

- [0001 — Deployment patterns](docs/adr/0001-deployment-patterns.md): Pattern A (Tauri local) + Pattern B (AWS / DynamoDB On-Demand). MS Project compat is out of scope.
- [0002 — Event log on DynamoDB](docs/adr/0002-event-log-on-dynamodb.md): single-table design, TTL retention, hot-partition risk + mitigation (date sharding when needed).
- [0003 — AI via MCP](docs/adr/0003-ai-via-external-mcp.md): AI features are an external MCP server + REST API; core product has zero AI runtime dependency.
- [0004 — Apache 2.0 + Trademark](docs/adr/0004-license-apache-2-with-trademark.md): code under Apache 2.0; YuiPath name and logo protected via TRADEMARKS.md.

## Debugging tips

- The repo can use **Chrome DevTools MCP** when installed. Use it to inspect actual rendered dimensions (`getBoundingClientRect`) and computed styles when CSS layout looks off — visual screenshots can be misleading at 1-2px scales.
- The dev server is just `python3 -m http.server`. If reloads don't pick up changes, kill and restart it.
- React state is debuggable via the in-browser React DevTools extension (no special config needed since this is plain UMD React).
