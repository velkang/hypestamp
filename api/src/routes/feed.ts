import { agreementWindowStart } from "../agent/converge";
import { Hono } from "hono";
import * as repo from "../db";
import { ok, type AppEnv } from "./respond";


// Posts in the active ruleset's window with what the model read from each and the
// trades that cite them: the data behind the signal timeline and the source views.
export const feed = new Hono<AppEnv>().get("/", async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const active = await repo.activeRuleset(db, now);
  if (!active) return ok(c, { window: null, posts: [] });

  const window = { from: agreementWindowStart(active.ruleset, now), to: now };
  const [posts, trades] = await Promise.all([
    repo.feedPosts(db, active.ruleset.extraction.promptHash, window.from, window.to),
    repo.listTrades(db),
  ]);

  const citations = new Map<string, number[]>();
  for (const trade of trades) {
    const { tweetIds } = JSON.parse(trade.requestJson) as { tweetIds: string[] };
    for (const id of tweetIds) citations.set(id, [...(citations.get(id) ?? []), trade.id]);
  }

  return ok(c, { window, posts: posts.map((post) => ({ ...post, citedBy: citations.get(post.id) ?? [] })) });
});
