import { ApiError } from "@/api/client";
import { createProject, deleteProject, refreshProjects, useProjects } from "@/stores/projects";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

export interface ProjectsViewProps {
  onSelect: (projectId: string) => void;
}

export function ProjectsView({ onSelect }: ProjectsViewProps) {
  const projects = useProjects();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshProjects().catch((e: Error) => setError(e.message));
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const p = await createProject(name.trim());
      setName("");
      onSelect(p.id);
    } catch (e) {
      setError(e instanceof ApiError ? `API ${e.status}` : (e as Error).message);
    }
  };

  return (
    <section>
      <h2>Projects</h2>
      {error && <p className="pw-error">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          className="pw-input"
          placeholder="New project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
        />
        <button type="button" className="pw-button" onClick={onCreate}>
          Create
        </button>
      </div>
      <div className="pw-card">
        {projects.length === 0 ? (
          <p style={{ color: "var(--text-soft)" }}>No projects yet.</p>
        ) : (
          <table className="pw-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--accent)",
                        padding: 0,
                      }}
                      onClick={() => onSelect(p.id)}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td style={{ color: "var(--text-soft)" }}>
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="pw-button is-secondary"
                      onClick={async () => {
                        if (confirm(`Delete "${p.name}"?`)) {
                          await deleteProject(p.id).catch((e: Error) => setError(e.message));
                        }
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
