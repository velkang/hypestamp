import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { keccak256, toBytes, type Hex } from "viem";
import { z } from "zod";
import type { Ruleset } from "../rulesets/schema";
import type { TweetFields } from "../stamp/encoding";
import type { Extraction } from "./types";

// Changing this text changes extractionPromptHash(), so a new prompt needs a new
// committed ruleset: the extraction step is pre-registered like the trading rules.
export const EXTRACTION_PROMPT = `You read crypto market posts from X and record what each post claims about specific tokens.

For every post, return:
- mentions: one entry per token the post takes a view on, using its ticker (e.g. BTC, ETH, LINK). Skip tokens that are only named in passing.
  - sentiment: -1 (clearly bearish) to 1 (clearly bullish); 0 when the view is neutral or unclear.
  - conviction: 0 to 1, how strongly the author commits to the view (hedged musing is low; "loading up" or a stated position is high).
  - urgency: 0 to 1, how time-sensitive the call is (a long-term thesis is low; "now", "today", "before the news" is high).
- isPromo: true when the post reads as promotion of a token or project (shilling, a sponsored-looking pitch, a referral push), not analysis.
- hasDisclosure: true only when the post discloses a paid relationship, sponsorship, or the author's own position (e.g. #ad, "sponsored", "I hold", "not financial advice, I'm long").
- rationale: one short sentence explaining the reading.

Return an entry for every post, even when it mentions no tokens (empty mentions). Judge only the text given; do not assume facts about the author.`;

export function extractionPromptHash(): Hex {
  return keccak256(toBytes(EXTRACTION_PROMPT));
}

const unit = z.number().min(0).max(1);

const outputSchema = z.object({
  extractions: z.array(
    z.object({
      tweetId: z.string(),
      mentions: z.array(
        z.object({
          token: z.string().min(1).max(16),
          sentiment: z.number().min(-1).max(1),
          conviction: unit,
          urgency: unit,
        }),
      ),
      isPromo: z.boolean(),
      hasDisclosure: z.boolean(),
      rationale: z.string(),
    }),
  ),
});

export type ExtractionClient = Pick<OpenAI, "responses">;

export async function extractTweets(
  client: ExtractionClient,
  ruleset: Ruleset,
  tweets: TweetFields[],
): Promise<Extraction[]> {
  if (ruleset.extraction.promptHash !== extractionPromptHash()) {
    throw new Error("Extraction prompt does not match the ruleset's committed promptHash");
  }
  if (tweets.length === 0) return [];

  const posts = tweets.map(({ id, author, text }) => ({ id, author, text }));
  const response = await client.responses.parse({
    model: ruleset.extraction.model,
    instructions: EXTRACTION_PROMPT,
    input: `Posts (JSON):\n${JSON.stringify(posts)}`,
    reasoning: { effort: "low" },
    text: { format: zodTextFormat(outputSchema, "extractions") },
  });

  // Refusals and truncated responses come back without parsed output.
  if (!response.output_parsed) {
    throw new Error(`Extraction returned no structured output (status: ${response.status ?? "unknown"})`);
  }

  // Re-validate: model output crosses a trust boundary before it can drive trades.
  const { extractions } = outputSchema.parse(response.output_parsed);
  const byId = new Map(tweets.map((tweet) => [tweet.id, tweet]));

  return extractions.flatMap((extraction) => {
    const tweet = byId.get(extraction.tweetId);
    if (!tweet) return [];
    return [
      {
        tweetId: tweet.id,
        author: tweet.author,
        postedAt: Date.parse(tweet.createdAt),
        mentions: extraction.mentions.map((m) => ({ ...m, token: m.token.toUpperCase() })),
        isPromo: extraction.isPromo,
        hasDisclosure: extraction.hasDisclosure,
        rationale: extraction.rationale,
      },
    ];
  });
}
