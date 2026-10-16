import { Hono } from "hono";
import * as repo from "../db";
import { ok, type AppEnv } from "./respond";

export const status = new Hono<AppEnv>().get("/", async (c) => {
  const db = c.env.DB;
  const [active, trades] = await Promise.all([repo.activeRuleset(db, Date.now()), repo.tradeCounts(db)]);
  return ok(c, {
    activeRuleset: active
      ? {
          hash: active.hash,
          effectiveFrom: active.ruleset.effectiveFrom,
          model: active.ruleset.extraction.model,
          sources: active.ruleset.sources.length,
          windowHours: active.ruleset.converge.windowHours,
        }
      : null,
    demo: trades.demo,
    trades: trades.counts,
  });
});
