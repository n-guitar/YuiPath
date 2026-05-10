// SPDX-License-Identifier: Apache-2.0
// Re-export auto-generated OpenAPI types + a small typed fetch wrapper.
//
// Regenerate with: `pnpm --filter @yuipath/api-client generate`
// (requires apps/api/openapi.json — run Phase 1 to produce it).

export type { paths, components, operations } from "./schema.js";

export interface ApiOptions {
  baseUrl?: string;
  authToken?: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** Bare-bones fetch wrapper. Phase 2 view code uses this. */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  opts: ApiOptions = {},
): Promise<T> {
  const baseUrl = opts.baseUrl ?? "";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (opts.authToken) {
    headers.set("authorization", `Bearer ${opts.authToken}`);
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, body, res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
