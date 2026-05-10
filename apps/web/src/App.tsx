// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";

interface HealthStatus {
  status: string;
}

export function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => r.json() as Promise<HealthStatus>)
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>YuiPath</h1>
      <p>Web only / Python FastAPI / AWS managed (skeleton)</p>
      {error && <p style={{ color: "red" }}>API error: {error}</p>}
      {health && <p>API health: {health.status}</p>}
    </main>
  );
}
