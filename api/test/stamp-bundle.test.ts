import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { bundleHash, parseStampRequest, sideCode, type StampRequest } from "../src/stamp/bundle";
import { canonicalJson, Side } from "../src/stamp/encoding";

const RULES = keccak256(toBytes("ruleset-a"));

const request: StampRequest = {
  rulesetHash: RULES,
  signal: { token: "LINK", coingeckoId: "chainlink", side: "long" },
  tweetIds: ["2110576209658548683", "2110576209658548684"],
  extractionsHash: keccak256(toBytes("extractions")),
  trade: { sizePct: 5, stopLossPct: 8, takeProfitPct: 20 },
  flags: 0,
  observedAt: 1_800_000_000,
};

const tweets = [
  { id: "2110576209658548683", hash: keccak256(toBytes("t1")) },
  { id: "2110576209658548684", hash: keccak256(toBytes("t2")) },
];

describe("parseStampRequest", () => {
  it("accepts a complete request", () => {
    expect(parseStampRequest(request)).toEqual(request);
  });

  it("rejects more than 10 tweets, the per-report consensus budget", () => {
    const tweetIds = Array.from({ length: 11 }, (_, i) => `${i + 1}`);
    expect(() => parseStampRequest({ ...request, tweetIds })).toThrow();
  });

  it("rejects duplicate tweet IDs", () => {
    expect(() => parseStampRequest({ ...request, tweetIds: ["1", "1"] })).toThrow();
  });

  it("rejects non-numeric tweet IDs so they cannot alter the API query", () => {
    expect(() => parseStampRequest({ ...request, tweetIds: ["1&count=100"] })).toThrow();
  });

  it("rejects lowercase or oversized token symbols", () => {
    expect(() => parseStampRequest({ ...request, signal: { ...request.signal, token: "link" } })).toThrow();
    expect(() => parseStampRequest({ ...request, signal: { ...request.signal, token: "A".repeat(17) } })).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() => parseStampRequest({ ...request, note: "x" })).toThrow();
  });
});

describe("sideCode", () => {
  it("maps sides to the ledger enum", () => {
    expect(sideCode("long")).toBe(Side.Long);
    expect(sideCode("short")).toBe(Side.Short);
  });
});

describe("bundleHash", () => {
  it("is keccak256 of the request with verified tweet hashes and the attested entry price", () => {
    const { tweetIds: _ids, ...rest } = request;
    const canonical = canonicalJson({ ...rest, tweets, entryPriceE8: "1825000000" });
    expect(bundleHash(request, tweets, 1_825_000_000n)).toBe(keccak256(toBytes(canonical)));
  });

  it("changes when a tweet's content hash changes", () => {
    const tampered = [tweets[0], { ...tweets[1], hash: keccak256(toBytes("edited")) }];
    expect(bundleHash(request, tampered, 1_825_000_000n)).not.toBe(bundleHash(request, tweets, 1_825_000_000n));
  });

  it("binds the historical risk context into the bundle while accepting older requests", () => {
    const empty = keccak256(toBytes(canonicalJson([])));
    const occupied = keccak256(toBytes(canonicalJson(["BTC"])));
    const newer = { ...request, riskContextHash: empty };
    expect(parseStampRequest(newer)).toEqual(newer);
    expect(bundleHash(newer, tweets, 1n)).not.toBe(bundleHash({ ...newer, riskContextHash: occupied }, tweets, 1n));
    expect(bundleHash(newer, tweets, 1n)).not.toBe(bundleHash(request, tweets, 1n));
  });

  it("changes when the entry price changes", () => {
    expect(bundleHash(request, tweets, 1n)).not.toBe(bundleHash(request, tweets, 1_825_000_000n));
  });
});
