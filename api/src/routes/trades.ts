import { Hono } from "hono";
import { describeFlags } from "../agent/flags";
import * as repo from "../db";
import { replayTrade } from "../replay";
import { fail, ok, type AppEnv } from "./respond";

const ID = /^\d{1,10}$/;

function summarize(trade: repo.TradeRow) {
  const { requestJson, signalJson, ...rest } = trade;
  const signal = JSON.parse(signalJson) as { explanation: string; kols: unknown[] };
  const request = JSON.parse(requestJson) as { flags: number };
  return { ...rest, request, flags: describeFlags(request.flags), explanation: signal.explanation, kols: signal.kols };
}

export const trades = new Hono<AppEnv>()
  .get("/", async (c) => ok(c, (await repo.listTrades(c.env.DB)).map(summarize)))
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID.test(id)) return fail(c, 400, "id must be a positive integer");
    const trade = await repo.getTrade(c.env.DB, Number(id));
    return trade ? ok(c, summarize(trade)) : fail(c, 404, "trade not found");
  })
  .get("/:id/replay", async (c) => {
    const id = c.req.param("id");
    if (!ID.test(id)) return fail(c, 400, "id must be a positive integer");
    const result = await replayTrade(c.env.DB, Number(id));
    return result ? ok(c, result) : fail(c, 404, "trade not found");
  });
