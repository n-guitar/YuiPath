// SPDX-License-Identifier: Apache-2.0
// Mock-style subscribable store for projects.
// Pattern: useSyncExternalStore with new array reference per update.

import { type Project, api } from "@/api/client";
import { useSyncExternalStore } from "react";

let _projects: Project[] = [];
const _subs = new Set<() => void>();

function _notify(): void {
  for (const cb of _subs) cb();
}

function subscribe(cb: () => void): () => void {
  _subs.add(cb);
  return () => {
    _subs.delete(cb);
  };
}

export function useProjects(): Project[] {
  return useSyncExternalStore(
    subscribe,
    () => _projects,
    () => _projects,
  );
}

export async function refreshProjects(): Promise<void> {
  _projects = await api.projects.list();
  _notify();
}

export async function createProject(name: string, description = ""): Promise<Project> {
  const p = await api.projects.create({ name, description });
  _projects = [..._projects, p];
  _notify();
  return p;
}

export async function deleteProject(id: string): Promise<void> {
  await api.projects.delete(id);
  _projects = _projects.filter((p) => p.id !== id);
  _notify();
}
