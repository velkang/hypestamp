import { describe, expect, it, vi } from "vitest";
import { EXTRACTION_PROMPT, extractTweets, extractionPromptHash, type ExtractionClient } from "../src/agent/extract";
import type { TweetFields } from "../src/stamp/encoding";
import { keccak256, toBytes } from "viem";
import { demoRuleset } from "./fixtures/ruleset";

const ruleset = { ...demoRuleset, extraction: { ...demoRuleset.extraction, promptHash: extractionPromptHash() } };

const tweets: TweetFields[] = [
  { id: "1", author: "cobie", text: "$link looks strong", createdAt: "Thu Oct 15 03:39:15 +0000 2026" },
  { id: "2", author: "CryptoHayes", text: "gm", createdAt: "Thu Oct 15 04:00:00 +0000 2026" },
];

function fakeClient(response: object): { client: ExtractionClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { responses: { parse } } as unknown as ExtractionClient, parse };
}

const okResponse = {
  status: "completed",
  output_parsed: {
    extractions: [
      {
        tweetId: "1",
        mentions: [{ token: "link", sentiment: 0.7, conviction: 0.8, urgency: 0.3 }],
        isPromo: false,
        hasDisclosure: false,
        rationale: "bullish on LINK",
      },
      { tweetId: "999", mentions: [], isPromo: false, hasDisclosure: false, rationale: "not requested" },
    ],
  },
};

describe("extractionPromptHash", () => {
  it("is keccak256 of the extraction prompt, so the prompt is part of the committed rules", () => {
    expect(extractionPromptHash()).toBe(keccak256(toBytes(EXTRACTION_PROMPT)));
  });
});

describe("extractTweets", () => {
  it("refuses to run when the prompt does not match the committed promptHash", async () => {
    const { client, parse } = fakeClient(okResponse);
    await expect(extractTweets(client, demoRuleset, tweets)).rejects.toThrow("promptHash");
    expect(parse).not.toHaveBeenCalled();
  });

  it("uses the ruleset's model with low reasoning effort and structured output", async () => {
    const { client, parse } = fakeClient(okResponse);
    await extractTweets(client, ruleset, tweets);
    const params = parse.mock.calls[0][0];
    expect(params).toMatchObject({
      model: ruleset.extraction.model,
      instructions: EXTRACTION_PROMPT,
      reasoning: { effort: "low" },
    });
    expect(params.text.format).toBeDefined();
    expect(params.input).toContain('"id":"1"');
  });

  it("maps model output to extractions with uppercase tickers and tweet timestamps", async () => {
    const { client } = fakeClient(okResponse);
    const result = await extractTweets(client, ruleset, tweets);
    expect(result).toEqual([
      {
        tweetId: "1",
        author: "cobie",
        postedAt: Date.parse("2026-10-15T03:39:15Z"),
        mentions: [{ token: "LINK", sentiment: 0.7, conviction: 0.8, urgency: 0.3 }],
        isPromo: false,
        hasDisclosure: false,
        rationale: "bullish on LINK",
      },
    ]);
  });

  it("fails on a refusal or incomplete response instead of reading empty output", async () => {
    const { client } = fakeClient({ status: "incomplete", output_parsed: null });
    await expect(extractTweets(client, ruleset, tweets)).rejects.toThrow("no structured output");
  });

  it("rejects out-of-range scores from the model", async () => {
    const bad = structuredClone(okResponse);
    bad.output_parsed.extractions[0].mentions[0].conviction = 3;
    const { client } = fakeClient(bad);
    await expect(extractTweets(client, ruleset, tweets)).rejects.toThrow();
  });

  it("makes no call for an empty batch", async () => {
    const { client, parse } = fakeClient(okResponse);
    expect(await extractTweets(client, ruleset, [])).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });
});
