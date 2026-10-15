import { describe, expect, it } from "vitest";
import worker from "../src";
const app = { request: (path: string) => worker.fetch(new Request(`http://localhost${path}`)) };

describe("API health", () => {
  it("reports readiness without exposing configuration", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
