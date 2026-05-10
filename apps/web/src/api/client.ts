// SPDX-License-Identifier: Apache-2.0
import { ApiError, apiFetch, type components } from "@yuipath/api-client";

export { ApiError };
export type Project = components["schemas"]["Project"];
export type Task = components["schemas"]["Task"];
export type Comment = components["schemas"]["Comment"];
export type Membership = components["schemas"]["Membership"];
export type CalendarTemplate = components["schemas"]["CalendarTemplate"];
export type Event = components["schemas"]["Event"];
export type User = components["schemas"]["User"];

const baseUrl = ""; // proxied via Vite to FastAPI

export const api = {
  me: () => apiFetch<User>("/api/me", {}, { baseUrl }),
  projects: {
    list: () => apiFetch<Project[]>("/api/projects", {}, { baseUrl }),
    create: (body: { name: string; description?: string }) =>
      apiFetch<Project>(
        "/api/projects",
        { method: "POST", body: JSON.stringify(body) },
        { baseUrl },
      ),
    get: (id: string) => apiFetch<Project>(`/api/projects/${id}`, {}, { baseUrl }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<Project>(
        `/api/projects/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        { baseUrl },
      ),
    delete: (id: string) =>
      apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" }, { baseUrl }),
  },
  tasks: {
    list: (projectId: string) =>
      apiFetch<Task[]>(`/api/projects/${projectId}/tasks`, {}, { baseUrl }),
    create: (projectId: string, body: Record<string, unknown>) =>
      apiFetch<Task>(
        `/api/projects/${projectId}/tasks`,
        { method: "POST", body: JSON.stringify(body) },
        { baseUrl },
      ),
    update: (projectId: string, taskId: string, body: Record<string, unknown>) =>
      apiFetch<Task>(
        `/api/projects/${projectId}/tasks/${taskId}`,
        { method: "PATCH", body: JSON.stringify(body) },
        { baseUrl },
      ),
    delete: (projectId: string, taskId: string) =>
      apiFetch<void>(
        `/api/projects/${projectId}/tasks/${taskId}`,
        { method: "DELETE" },
        { baseUrl },
      ),
  },
  events: {
    listByProject: (projectId: string, limit = 50) =>
      apiFetch<Event[]>(`/api/projects/${projectId}/events?limit=${limit}`, {}, { baseUrl }),
  },
};
