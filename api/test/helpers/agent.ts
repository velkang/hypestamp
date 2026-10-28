import { vi } from "vitest";
import { extractionPromptHash, type ExtractionClient } from "../../src/agent/extract";
import { rulesetHash } from "../../src/stamp/encoding";
import { demoRuleset } from "../fixtures/ruleset";

export const NOW = Date.parse("2026-10-15T12:00:00Z");
export const ruleset = {
  ...demoRuleset,
  // In force before every fixture post: posts from before a ruleset's start never count.
  effectiveFrom: Math.floor(NOW / 1000) - 7 * 3600,
  extraction: { ...demoRuleset.extraction, promptHash: extractionPromptHash() },
};
export const RULESET_HASH = rulesetHash(ruleset);

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

export function fakeTwitter(): typeof fetch {
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
export function fakeModel(): ExtractionClient {
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

