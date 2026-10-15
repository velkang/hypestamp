import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../src/db";
import { reconcileStamps } from "../src/ledger/reconcile";
import * as store from "../src/rulesets/store";
import { rulesetHash } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";
import { demoRuleset } from "./fixtures/ruleset";

const NOW = 1_800_000_000_000;
let db: D1Database;
let dispose: () => Promise<void>;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
});
afterEach(() => dispose());

const older = { ...demoRuleset, effectiveFrom: 1_000 };
const newer = { ...demoRuleset, effectiveFrom: 2_000 };

describe("pending rulesets", () => {
  it("are never in force until confirmed on-chain", async () => {
    await repo.saveRuleset(db, older, rulesetHash(older), 900);
    await store.savePendingRuleset(db, newer, rulesetHash(newer), 1_900);

    expect((await repo.activeRuleset(db, 3_000_000))?.hash).toBe(rulesetHash(older));
    expect((await store.pendingRulesets(db)).map((r) => r.hash)).toEqual([rulesetHash(newer)]);

    await store.confirmRuleset(db, rulesetHash(newer), "0xtx");
    expect((await repo.activeRuleset(db, 3_000_000))?.hash).toBe(rulesetHash(newer));
    expect(await store.pendingRulesets(db)).toEqual([]);
  });

  it("lists every ruleset with its status", async () => {
    await repo.saveRuleset(db, older, rulesetHash(older), 900);
    await store.savePendingRuleset(db, newer, rulesetHash(newer), 1_900);
    const rows = await repo.listRulesets(db);
    expect(rows.map((r) => [r.hash, r.status])).toEqual([
      [rulesetHash(newer), "pending"],
      [rulesetHash(older), "confirmed"],
    ]);
  });
});

describe("reconcileStamps with ruleset commits", () => {
  const ledger = (committed: { rulesetHash: string; txHash: string }[]) => ({
    headBlock: vi.fn().mockResolvedValue(600n),
    stampedEvents: vi.fn().mockResolvedValue([]),
    committedRulesets: vi.fn().mockResolvedValue(committed),
  });

  it("confirms a pending ruleset when its RulesetCommitted event appears", async () => {
    const hash = rulesetHash(newer);
    await store.savePendingRuleset(db, newer, hash, NOW - 60_000);
    const result = await reconcileStamps({ db, ledger: ledger([{ rulesetHash: hash, txHash: "0xabc" }]), now: NOW, startBlock: 500n });
    expect(result.confirmedRulesets).toEqual([hash]);
    expect(await store.pendingRulesets(db)).toEqual([]);
  });

  it("fails a pending ruleset that never lands within 30 minutes", async () => {
    const hash = rulesetHash(newer);
    await store.savePendingRuleset(db, newer, hash, NOW - 31 * 60_000);
    const result = await reconcileStamps({ db, ledger: ledger([]), now: NOW, startBlock: 500n });
    expect(result.failedRulesets).toEqual([hash]);
    expect((await repo.listRulesets(db))[0].status).toBe("failed");
  });
});
