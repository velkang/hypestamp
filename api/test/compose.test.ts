import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { extractionPromptHash } from "../src/agent/extract";
import { createApp } from "../src/app";
import * as repo from "../src/db";
import type { Ruleset } from "../src/rulesets/schema";
import { rulesetHash } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";

const CHAIN_NOW = 1_800_000_000;
const draft = {
  version: 1,
  sources: [{ handle: "cobie", trustWeight: 0.9 }, { handle: "CryptoHayes", trustWeight: 0.8 }],
  extraction: { model: "gpt-6-luna", schemaVersion: 1 },
  converge: { minKols: 2, windowHours: 12, minConviction: 0.6, minTrustSum: 1.3 },
  risk: { maxPositionPct: 5, stopLossPct: 8, takeProfitPct: 20, maxOpen: 3 },
  flags: { burstMinutes: 15, burstMinKols: 3, promoKeywords: ["#ad"] },
};

let db: D1Database;
let dispose: () => Promise<void>;
let commitRuleset: Mock<(ruleset: Ruleset) => Promise<void>>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  commitRuleset = vi.fn<(ruleset: Ruleset) => Promise<void>>().mockResolvedValue(undefined);
  app = createApp({
    chainState: async () => ({ chainNow: CHAIN_NOW, cooldown: 120 }),
    bridge: () => ({ commitRuleset, submitStamp: vi.fn() }),
    bridgeUp: async () => true,
  });
});
afterEach(() => dispose());

const OWNER = { Authorization: "Bearer s3cret" };

const post = (path: string, body: unknown, headers: Record<string, string> = {}, env: Record<string, unknown> = {}) =>
  app.request(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }, { DB: db, ADMIN_TOKEN: "s3cret", ...env });

describe("POST /v1/admin/rulesets/preview", () => {
  it("returns the exact ruleset that would be committed, its hash and when it takes effect", async () => {
    const response = await post("/v1/admin/rulesets/preview", draft, OWNER);
    const { data } = (await response.json()) as { data: { ruleset: { effectiveFrom: number; extraction: { promptHash: string } }; hash: string; cooldown: number } };
    expect(response.status).toBe(200);
    expect(data.ruleset.effectiveFrom).toBe(CHAIN_NOW + 120 + 60);
    expect(data.ruleset.extraction.promptHash).toBe(extractionPromptHash());
    expect(data.hash).toBe(rulesetHash(data.ruleset as never));
    expect(data.cooldown).toBe(120);
  });

  it("explains every invalid field", async () => {
    const response = await post("/v1/admin/rulesets/preview", { ...draft, sources: [], risk: { ...draft.risk, maxPositionPct: 500 } }, OWNER);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/sources/);
    expect(body.error).toMatch(/risk\.maxPositionPct/);
  });
});

describe("POST /v1/admin/rulesets", () => {
  it("refuses without the owner's admin token", async () => {
    expect((await post("/v1/admin/rulesets", draft)).status).toBe(401);
    expect((await post("/v1/admin/rulesets", draft, { Authorization: "Bearer wrong" })).status).toBe(401);
    expect(commitRuleset).not.toHaveBeenCalled();
  });

  it("is unavailable when no admin token is configured", async () => {
    expect((await post("/v1/admin/rulesets", draft, { Authorization: "Bearer s3cret" }, { ADMIN_TOKEN: undefined })).status).toBe(503);
  });

  it("records the ruleset as pending and hands it to CRE", async () => {
    const response = await post("/v1/admin/rulesets", draft, { Authorization: "Bearer s3cret" });
    const { data } = (await response.json()) as { data: { hash: string; status: string; effectiveFrom: number } };

    expect(response.status).toBe(202);
    expect(data).toMatchObject({ status: "pending", effectiveFrom: CHAIN_NOW + 180 });
    expect(commitRuleset).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: CHAIN_NOW + 180 }));
    expect((await repo.listRulesets(db))[0]).toMatchObject({ hash: data.hash, status: "pending" });
    expect(await repo.activeRuleset(db, Date.now())).toBeNull();
  });

  it("marks the ruleset failed when CRE does not accept the job", async () => {
    commitRuleset.mockRejectedValueOnce(new Error("bridge down"));
    const response = await post("/v1/admin/rulesets", draft, { Authorization: "Bearer s3cret" });
    expect(response.status).toBe(502);
    expect((await repo.listRulesets(db))[0].status).toBe("failed");
  });

  it("rejects committing the same ruleset twice", async () => {
    await post("/v1/admin/rulesets", draft, { Authorization: "Bearer s3cret" });
    expect((await post("/v1/admin/rulesets", draft, { Authorization: "Bearer s3cret" })).status).toBe(409);
  });
});
