import { Hono, type MiddlewareHandler } from "hono";
import * as repo from "../db";
import { parseRuleset } from "../rulesets/schema";
import { composeRoutes, type ComposeDeps } from "./compose";
import { fail, ok, type AppBindings, type AppEnv } from "./respond";

// Constant-time bearer check for owner-only routes (the Workers runtime and Node
// test runtime share no timingSafeEqual, so compare bytes manually).
export function isOwner(header: string | undefined, token: string): boolean {
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  const actual = new TextEncoder().encode(header ?? "");
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (actual[i] ?? 0);
  return diff === 0;
}

const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.ADMIN_TOKEN) return fail(c, 503, "admin is disabled: no ADMIN_TOKEN is configured");
  if (!isOwner(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return fail(c, 401, "owner token required");
  await next();
};

export type AdminDeps = ComposeDeps & { bridgeUp: (env: AppBindings) => Promise<boolean> };

async function rulesetRows(db: D1Database) {
  return (await repo.listRulesets(db)).map(({ json, ...row }) => {
    const ruleset = parseRuleset(JSON.parse(json));
    return { ...row, model: ruleset.extraction.model, sources: ruleset.sources.length };
  });
}

// Everything only the operator needs: agent health, every ruleset including ones
// still pending or failed on-chain, and composing new rulesets.
export function adminRoutes(deps: AdminDeps) {
  return new Hono<AppEnv>()
    .use("*", requireOwner)
    .get("/overview", async (c) => {
      const db = c.env.DB;
      const [fetchedAt, block, trades, rulesets, bridgeUp] = await Promise.all([
        repo.lastFetchAt(db),
        repo.lastSyncedBlock(db),
        repo.tradeCounts(db),
        rulesetRows(db),
        deps.bridgeUp(c.env).catch(() => false),
      ]);
      return ok(c, {
        agent: { lastFetchAt: fetchedAt, lastSyncedBlock: block === null ? null : block.toString(), bridgeUp },
        trades: trades.counts,
        rulesets,
      });
    })
    .route("/rulesets", composeRoutes(deps));
}
