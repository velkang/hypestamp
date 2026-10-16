import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import * as repo from "../src/db";
import * as store from "../src/rulesets/store";
import { createTestDb } from "./helpers/d1";
import { NOW, ruleset, RULESET_HASH } from "./helpers/agent";

const PENDING_HASH = `0x${"ab".repeat(32)}`;
let db: D1Database;
let dispose: () => Promise<void>;
let bridgeUp: () => Promise<boolean>;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
  await store.savePendingRuleset(db, { ...ruleset, version: 2, effectiveFrom: ruleset.effectiveFrom + 3600 }, PENDING_HASH, NOW);
  bridgeUp = async () => true;
});
afterEach(() => dispose());

const app = () =>
  createApp({
    chainState: async () => ({ chainNow: NOW / 1000, cooldown: 120 }),
    bridge: () => ({ commitRuleset: vi.fn(), submitStamp: vi.fn() }),
    bridgeUp: () => bridgeUp(),
  });

const get = async (path: string, headers: Record<string, string> = {}, env: Record<string, unknown> = {}) => {
  const response = await app().request(path, { headers }, { DB: db, ADMIN_TOKEN: "s3cret", ...env });
  return { status: response.status, body: (await response.json()) as { success: boolean; data?: any; error?: string } };
};
const OWNER = { Authorization: "Bearer s3cret" };

describe("GET /v1/admin/overview", () => {
  it("is closed without the owner token, and disabled when none is configured", async () => {
    expect((await get("/v1/admin/overview")).status).toBe(401);
    expect((await get("/v1/admin/overview", { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await get("/v1/admin/overview", OWNER, { ADMIN_TOKEN: undefined })).status).toBe(503);
  });

  it("reports agent health, trade counts and every ruleset including pending ones", async () => {
    await repo.setLastSyncedBlock(db, 11_921_132n);
    const { status, body } = await get("/v1/admin/overview", OWNER);
    expect(status).toBe(200);
    expect(body.data.agent).toEqual({ lastFetchAt: null, lastSyncedBlock: "11921132", bridgeUp: true });
    expect(body.data.trades).toEqual({ submitted: 0, stamped: 0, failed: 0 });
    expect(body.data.rulesets.map((r: { hash: string; status: string }) => [r.hash, r.status])).toEqual([
      [PENDING_HASH, "pending"],
      [RULESET_HASH, "confirmed"],
    ]);
  });

  it("reports the bridge down when it cannot be reached", async () => {
    bridgeUp = () => Promise.reject(new Error("connection refused"));
    expect((await get("/v1/admin/overview", OWNER)).body.data.agent.bridgeUp).toBe(false);
  });
});

describe("public routes", () => {
  it("only list rulesets the ledger has recorded", async () => {
    const { body } = await get("/v1/rulesets");
    expect(body.data.map((r: { hash: string }) => r.hash)).toEqual([RULESET_HASH]);
  });
});
