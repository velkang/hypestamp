import { Hono } from "hono";
import { realizedPnl } from "../agent/exits";
import { describeFlags } from "../agent/flags";
import * as repo from "../db";
import { replayTrade } from "../replay";
import { fail, ok, type AppEnv } from "./respond";

const ID = /^\d{1,10}$/;

function summarize(trade: repo.TradeRow) {
  const { requestJson, signalJson, ...rest } = trade;
  const signal = JSON.parse(signalJson) as { explanation: string; kols: unknown[] };
  const request = JSON.parse(requestJson) as { flags: number; tweetIds: string[] };
  return { ...rest, pnl: realizedPnl(trade), request, flags: describeFlags(request.flags), explanation: signal.explanation, kols: signal.kols };
}

export const trades = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, await Promise.all((await repo.listTrades(c.env.DB)).map(async (trade) => ({
    ...summarize(trade), replayVerdict: (await replayTrade(c.env.DB, trade.id))!.verdict,
  })))))
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID.test(id)) return fail(c, 400, "id must be a positive integer");
    const trade = await repo.getTrade(c.env.DB, Number(id));
    if (!trade) return fail(c, 404, "trade not found");
    // Cited posts are the evidence, so they are returned whatever the feed window is.
    const summary = summarize(trade);
    const stored = new Map((await repo.tweetsByIds(c.env.DB, summary.request.tweetIds)).map((t) => [t.id, t]));
    const posts = summary.request.tweetIds.flatMap((tweetId) => (stored.has(tweetId) ? [stored.get(tweetId)!] : []));
    return ok(c, { ...summary, posts });
  })
  .get("/:id/replay", async (c) => {
    const id = c.req.param("id");
    if (!ID.test(id)) return fail(c, 400, "id must be a positive integer");
    const result = await replayTrade(c.env.DB, Number(id));
    return result ? ok(c, result) : fail(c, 404, "trade not found");
  });
