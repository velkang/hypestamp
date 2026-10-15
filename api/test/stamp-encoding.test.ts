import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { canonicalJson, tweetHash } from "../src/stamp/encoding";

describe("canonicalJson", () => {
  it("sorts object keys at every depth and drops whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,{"e":2,"f":1}]},"b":1}',
    );
  });

  it("produces the same string regardless of key order", () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it("rejects values that have no stable JSON form", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe("tweetHash", () => {
  const tweet = {
    id: "1846000000000000000",
    author: "cobie",
    text: "watching $LINK",
    createdAt: "2026-10-15T09:00:00.000Z",
  };

  it("hashes only the stable tweet fields", () => {
    const withVolatile = { ...tweet, likeCount: 10, retweetCount: 4 };
    expect(tweetHash(withVolatile)).toBe(tweetHash(tweet));
  });

  it("is keccak256 of the canonical stable fields", () => {
    expect(tweetHash(tweet)).toBe(keccak256(toBytes(canonicalJson(tweet))));
  });

  it("changes when the text changes", () => {
    expect(tweetHash({ ...tweet, text: "selling $LINK" })).not.toBe(tweetHash(tweet));
  });
});
