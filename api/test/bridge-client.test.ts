import { describe, expect, it, vi } from "vitest";
import { createBridgeClient } from "../src/stamp/bridge-client";
import type { StampRequest } from "../src/stamp/bundle";
import { demoRuleset } from "./fixtures/ruleset";

const request = { rulesetHash: `0x${"11".repeat(32)}` } as StampRequest;

describe("createBridgeClient", () => {
  it("posts stamp requests in the workflow's action envelope with the bridge token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await createBridgeClient({ fetch, url: "http://127.0.0.1:8789", token: "secret" }).submitStamp(request);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8789/submit");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer secret" });
    expect(JSON.parse(init.body)).toEqual({ action: "stampEvidence", request });
  });

  it("posts ruleset commits the same way", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await createBridgeClient({ fetch, url: "http://bridge", token: "t" }).commitRuleset(demoRuleset);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "commitRuleset", ruleset: demoRuleset });
  });

  it("throws when the bridge does not accept the job", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    await expect(createBridgeClient({ fetch, url: "http://bridge", token: "t" }).submitStamp(request)).rejects.toThrow(
      "429",
    );
  });
});
