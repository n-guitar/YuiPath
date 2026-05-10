// SPDX-License-Identifier: Apache-2.0
// Mock theme system: auto/light/dark with prefers-color-scheme listener.
// Persisted in localStorage.

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "yuipath:theme";

export function loadThemeMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "auto";
}

export function saveThemeMode(mode: ThemeMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
}
