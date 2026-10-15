import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { keccak256, toBytes } from "viem";
import { runAgentCycle, type CycleDeps } from "../src/agent/cycle";
import { extractionPromptHash } from "../src/agent/extract";
import { FLAG } from "../src/agent/flags";
import * as repo from "../src/db";
import { parseStampRequest, type StampRequest } from "../src/stamp/bundle";
import { canonicalJson } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";
import { fakeModel, fakeTwitter, NOW, ruleset, RULESET_HASH } from "./helpers/agent";

let db: D1Database;
let dispose: () => Promise<void>;
let deps: CycleDeps;
let submitStamp: Mock<(request: StampRequest) => Promise<void>>;

beforeEach(async () => {
  ({ db, dispose } = await createTestDb());
  submitStamp = vi.fn<(request: StampRequest) => Promise<void>>().mockResolvedValue(undefined);
  deps = { db, now: NOW, fetch: fakeTwitter(), twitterApiKey: "k", model: fakeModel(), submitStamp };
});
afterEach(() => dispose());

describe("runAgentCycle", () => {
  it("does nothing until a ruleset is in effect", async () => {
    expect(await runAgentCycle(deps)).toEqual({ status: "no-active-ruleset" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("turns converging KOL calls into one submitted, stampable trade", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);

    const result = await runAgentCycle(deps);

    expect(result).toMatchObject({ status: "ok", newTweets: 3, extracted: 3, submitted: ["LINK"] });
    expect(submitStamp).toHaveBeenCalledTimes(1);

    const request = parseStampRequest(submitStamp.mock.calls[0][0]);
    expect(request).toMatchObject({
      rulesetHash: RULESET_HASH,
      signal: { token: "LINK", coingeckoId: "chainlink", side: "long" },
      tweetIds: ["201", "101"], // CryptoHayes, cobie (sorted by handle)
      trade: { sizePct: 4, stopLossPct: 8, takeProfitPct: 20 },
      flags: 0,
      observedAt: Math.floor(NOW / 1000),
    });

    const cited = (await repo.extractionsSince(db, extractionPromptHash(), 0))
      .filter((e) => ["101", "201"].includes(e.tweetId))
      .sort((a, b) => (a.tweetId < b.tweetId ? -1 : 1));
    expect(request.extractionsHash).toBe(keccak256(toBytes(canonicalJson(cited))));

    expect(await repo.openTradeTokens(db)).toEqual(["LINK"]);
  });

  it("works on whole seconds so replay can reproduce the decision from observedAt", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    await runAgentCycle({ ...deps, now: NOW + 987 });

    const request = parseStampRequest(submitStamp.mock.calls[0][0]);
    const asOf = request.observedAt * 1000;
    expect(asOf).toBe(NOW);
    const known = await repo.extractionsSince(db, extractionPromptHash(), 0, asOf);
    expect(known.map((e) => e.tweetId).sort()).toEqual(["101", "201", "301"]);
    expect(await repo.extractionsSince(db, extractionPromptHash(), 0, asOf - 1)).toEqual([]);
  });

  it("records evidence flags from the cited tweets in the stamp request", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    const twitter = fakeTwitter();
    deps.fetch = (async (input: RequestInfo | URL) => {
      const response = await twitter(input);
      const body = (await response.json()) as { data: { tweets: { text: string }[] } };
      for (const t of body.data.tweets) if (t.text.includes("$LINK")) t.text += " (sponsored)";
      return new Response(JSON.stringify(body));
    }) as typeof fetch;

    await runAgentCycle(deps);

    expect(parseStampRequest(submitStamp.mock.calls[0][0]).flags).toBe(FLAG.PAID_MARKER);
  });

  it("does not resubmit while the position is open", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    await runAgentCycle(deps);
    const second = await runAgentCycle({ ...deps, now: NOW + 300_000 });

    expect(second).toMatchObject({ status: "ok", newTweets: 0, extracted: 0, submitted: [] });
    expect(submitStamp).toHaveBeenCalledTimes(1);
  });

  it("marks the trade failed when submission to CRE fails, so it can be retried", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    submitStamp.mockRejectedValueOnce(new Error("bridge down"));

    const result = await runAgentCycle(deps);

    expect(result).toMatchObject({ status: "ok", submitted: [], errors: ["LINK: bridge down"] });
    expect(await repo.openTradeTokens(db)).toEqual([]);
  });

  it("keeps going when one source's timeline fails", async () => {
    await repo.saveRuleset(db, ruleset, RULESET_HASH, NOW - 4_000_000);
    const twitter = fakeTwitter();
    deps.fetch = (async (input: RequestInfo | URL) =>
      String(input).includes("blknoiz06") ? new Response("{}", { status: 500 }) : twitter(input)) as typeof fetch;

    const result = await runAgentCycle(deps);

    expect(result).toMatchObject({ status: "ok", newTweets: 2, submitted: ["LINK"] });
    expect((result as { errors: string[] }).errors[0]).toContain("@blknoiz06");
  });
});
