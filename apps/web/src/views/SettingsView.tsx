import { type User, api } from "@/api/client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

export function SettingsView() {
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {error && <p className="pw-error">{error}</p>}
      <div className="pw-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Current user</h3>
        {me ? (
          <dl style={{ margin: 0 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <dt style={{ color: "var(--text-soft)", minWidth: 120 }}>id</dt>
              <dd style={{ margin: 0 }}>{me.id}</dd>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <dt style={{ color: "var(--text-soft)", minWidth: 120 }}>email</dt>
              <dd style={{ margin: 0 }}>{me.email}</dd>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <dt style={{ color: "var(--text-soft)", minWidth: 120 }}>display name</dt>
              <dd style={{ margin: 0 }}>{me.display_name}</dd>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <dt style={{ color: "var(--text-soft)", minWidth: 120 }}>system admin</dt>
              <dd style={{ margin: 0 }}>{me.is_system_admin ? "yes" : "no"}</dd>
            </div>
          </dl>
        ) : (
          <p style={{ color: "var(--text-soft)" }}>Loading…</p>
        )}
      </div>
      <div className="pw-card">
        <h3 style={{ marginTop: 0 }}>About</h3>
        <p style={{ margin: 0, color: "var(--text-soft)" }}>
          YuiPath is an Apache 2.0 licensed OSS project management tool. The current build is Phase
          2 (frontend skeleton). See the mock under <code>mock/project/</code> for the full UX
          specification — gantt, calendar, resources views are still to be ported.
        </p>
      </div>
    </section>
  );
}
