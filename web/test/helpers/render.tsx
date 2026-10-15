import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { routes } from "../../src/routes";
import { API } from "./fixtures";

// Renders the real app at a path with /v1 answered from fixtures (404 for anything else).
// An override whose value is an Error answers that route with its `status` (default 500)
// and message. Non-GET requests are looked up as "METHOD /path".
export function renderAt(path: string, overrides: Record<string, unknown> = {}) {
  const api = { ...API, ...overrides };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = method === "GET" ? String(input) : `${method} ${String(input)}`;
    const value = api[url];
    if (value instanceof Error) {
      const status = (value as Error & { status?: number }).status ?? 500;
      return new Response(JSON.stringify({ success: false, error: value.message }), { status });
    }
    return url in api
      ? new Response(JSON.stringify({ success: true, data: value }), { status: 200 })
      : new Response(JSON.stringify({ success: false, error: "not found" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { fetch, ...render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>) };
}
