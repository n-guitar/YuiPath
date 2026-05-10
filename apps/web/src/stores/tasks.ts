import { type Task, api } from "@/api/client";
// SPDX-License-Identifier: Apache-2.0
import { useSyncExternalStore } from "react";

let _byProject: Record<string, Task[]> = {};
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

export function useTasks(projectId: string | null): Task[] {
  return useSyncExternalStore(
    subscribe,
    () => (projectId ? (_byProject[projectId] ?? []) : []),
    () => (projectId ? (_byProject[projectId] ?? []) : []),
  );
}

export async function refreshTasks(projectId: string): Promise<void> {
  const list = await api.tasks.list(projectId);
  _byProject = { ..._byProject, [projectId]: list };
  _notify();
}

export async function createTask(
  projectId: string,
  body: { name: string; start: string; end: string; duration: number; status?: string },
): Promise<Task> {
  const t = await api.tasks.create(projectId, { ...body, status: body.status ?? "todo" });
  _byProject = {
    ..._byProject,
    [projectId]: [...(_byProject[projectId] ?? []), t],
  };
  _notify();
  return t;
}

export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: string,
  expectedVersion: number,
): Promise<void> {
  const updated = await api.tasks.update(projectId, taskId, {
    status,
    expected_version: expectedVersion,
  });
  _byProject = {
    ..._byProject,
    [projectId]: (_byProject[projectId] ?? []).map((t) => (t.id === taskId ? updated : t)),
  };
  _notify();
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await api.tasks.delete(projectId, taskId);
  _byProject = {
    ..._byProject,
    [projectId]: (_byProject[projectId] ?? []).filter((t) => t.id !== taskId),
  };
  _notify();
}
