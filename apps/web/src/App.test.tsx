// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/projects")) {
        return Promise.resolve(new Response(JSON.stringify([])));
      }
      if (url.endsWith("/api/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "u",
              email: "u@example.com",
              display_name: "u",
              is_system_admin: true,
            }),
          ),
        );
      }
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the YuiPath title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("YuiPath");
  });

  it("shows Projects view by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Projects");
  });
});
