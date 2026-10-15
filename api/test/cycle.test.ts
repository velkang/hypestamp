import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { keccak256, toBytes } from "viem";
import { runAgentCycle, type CycleDeps } from "../src/agent/cycle";
import { extractionPromptHash, type ExtractionClient } from "../src/agent/extract";
import * as repo from "../src/db";
import { parseStampRequest, type StampRequest } from "../src/stamp/bundle";
import { canonicalJson, rulesetHash } from "../src/stamp/encoding";
import { createTestDb } from "./helpers/d1";
import { demoRuleset } from "./fixtures/ruleset";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const ruleset = {
  ...demoRuleset,
  effectiveFrom: Math.floor(NOW / 1000) - 600,
  extraction: { ...demoRuleset.extraction, promptHash: extractionPromptHash() },
};
const RULESET_HASH = rulesetHash(ruleset);

const twitterDate = (msAgo: number) => {
  const d = new Date(NOW - msAgo);
  // twitterapi.io format, e.g. "Thu Oct 15 11:00:00 +0000 2026"
  const [wd, dd, mon, yyyy, time] = d.toUTCString().replace(",", "").split(" ");
  return `${wd} ${mon} ${dd} ${time} +0000 ${yyyy}`;
};

const timelines: Record<string, { id: string; text: string; ago: number }[]> = {
  cobie: [{ id: "101", text: "$LINK is the trade", ago: 3_600_000 }],
  CryptoHayes: [{ id: "201", text: "Loading $LINK", ago: 1_800_000 }],
  blknoiz06: [{ id: "301", text: "gm", ago: 600_000 }],
};

function fakeTwitter(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const handle = new URL(url).searchParams.get("userName")!;
    const tweets = (timelines[handle] ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      createdAt: twitterDate(t.ago),
      author: { userName: handle },
      retweeted_tweet: null,
    }));
    return new Response(JSON.stringify({ status: "success", data: { tweets } }));
  }) as unknown as typeof fetch;
}

// Bullish LINK with conviction 0.8 for any post mentioning $LINK.
function fakeModel(): ExtractionClient {
  const parse = vi.fn(async (params: { input: string }) => {
    const posts = JSON.parse(params.input.slice(params.input.indexOf("["))) as { id: string; text: string }[];
    return {
      status: "completed",
      output_parsed: {
        extractions: posts.map((p) => ({
          tweetId: p.id,
          mentions: p.text.includes("$LINK") ? [{ token: "LINK", sentiment: 0.7, conviction: 0.8, urgency: 0.4 }] : [],
          isPromo: false,
          hasDisclosure: false,
          rationale: "",
        })),
      },
    };
  });
  return { responses: { parse } } as unknown as ExtractionClient;
}

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
