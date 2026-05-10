import { ApiError } from "@/api/client";
import { createTask, deleteTask, refreshTasks, updateTaskStatus, useTasks } from "@/stores/tasks";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

const STATUSES = [
  "todo",
  "started",
  "in-progress-50",
  "in-progress-80",
  "review",
  "done",
  "blocked",
] as const;

export interface TasksViewProps {
  projectId: string | null;
}

export function TasksView({ projectId }: TasksViewProps) {
  const tasks = useTasks(projectId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    refreshTasks(projectId).catch((e: Error) => setError(e.message));
  }, [projectId]);

  if (!projectId) {
    return (
      <section>
        <h2>Tasks</h2>
        <p style={{ color: "var(--text-soft)" }}>Select a project from Projects view first.</p>
      </section>
    );
  }

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createTask(projectId, {
        name: name.trim(),
        start: today,
        end: today,
        duration: 1,
        status: "todo",
      });
      setName("");
    } catch (e) {
      setError(e instanceof ApiError ? `API ${e.status}` : (e as Error).message);
    }
  };

  return (
    <section>
      <h2>Tasks</h2>
      {error && <p className="pw-error">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          className="pw-input"
          placeholder="New task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
        />
        <button type="button" className="pw-button" onClick={onCreate}>
          Add task
        </button>
      </div>
      <div className="pw-card">
        {tasks.length === 0 ? (
          <p style={{ color: "var(--text-soft)" }}>No tasks yet.</p>
        ) : (
          <table className="pw-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <select
                      className="pw-input"
                      value={t.status}
                      onChange={async (e) => {
                        try {
                          await updateTaskStatus(projectId, t.id, e.target.value, t.version);
                        } catch (err) {
                          setError(
                            err instanceof ApiError ? `API ${err.status}` : (err as Error).message,
                          );
                        }
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ color: "var(--text-soft)" }}>{t.start}</td>
                  <td style={{ color: "var(--text-soft)" }}>{t.end}</td>
                  <td>
                    <button
                      type="button"
                      className="pw-button is-secondary"
                      onClick={async () => {
                        await deleteTask(projectId, t.id).catch((e: Error) => setError(e.message));
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
