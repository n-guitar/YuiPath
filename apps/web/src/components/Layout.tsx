import { type ThemeMode, applyTheme, loadThemeMode, resolveTheme, saveThemeMode } from "@/theme";
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type ViewKey = "projects" | "tasks" | "settings";

export interface LayoutProps {
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  children: ReactNode;
}

export function Layout({ view, onViewChange, children }: LayoutProps) {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode());

  useEffect(() => {
    applyTheme(resolveTheme(mode));
    saveThemeMode(mode);
    if (mode === "auto" && typeof window !== "undefined") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyTheme(resolveTheme("auto"));
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    }
    return undefined;
  }, [mode]);

  return (
    <div className="pw-app">
      <aside className="pw-sidebar">
        <h1>YuiPath</h1>
        <nav>
          <button
            type="button"
            className={view === "projects" ? "is-active" : ""}
            onClick={() => onViewChange("projects")}
          >
            Projects
          </button>
          <button
            type="button"
            className={view === "tasks" ? "is-active" : ""}
            onClick={() => onViewChange("tasks")}
          >
            Tasks
          </button>
          <button
            type="button"
            className={view === "settings" ? "is-active" : ""}
            onClick={() => onViewChange("settings")}
          >
            Settings
          </button>
        </nav>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <small style={{ color: "var(--text-soft)" }}>Theme</small>
          <div style={{ display: "flex", gap: 4 }}>
            {(["auto", "light", "dark"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`pw-button is-secondary${mode === m ? "" : ""}`}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  fontWeight: mode === m ? 600 : 400,
                  borderColor: mode === m ? "var(--accent)" : undefined,
                }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="pw-main">{children}</main>
    </div>
  );
}
