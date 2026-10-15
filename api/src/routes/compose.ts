import { Hono } from "hono";
import * as repo from "../db";
import { prepareRuleset } from "../rulesets/prepare";
import { parseDraft, RulesetValidationError } from "../rulesets/schema";
import * as store from "../rulesets/store";
import type { Ruleset } from "../rulesets/schema";
import { rulesetHash } from "../stamp/encoding";
import { isOwner } from "./admin";
import { fail, ok, type AppBindings, type AppEnv } from "./respond";

export type ComposeDeps = {
  chainState: (env: AppBindings) => Promise<{ chainNow: number; cooldown: number }>;
  bridge: (env: AppBindings) => { commitRuleset: (ruleset: Ruleset) => Promise<void> };
};

async function prepare(deps: ComposeDeps, env: AppBindings, body: unknown) {
  const draft = parseDraft(body);
  const chain = await deps.chainState(env);
  const ruleset = prepareRuleset(draft, chain);
  return { ruleset, hash: rulesetHash(ruleset), cooldown: chain.cooldown };
}

// Anyone can preview a draft; only the owner can commit one, because each commit is
// a transaction the owner's wallet pays for through the CRE bridge.
export function composeRoutes(deps: ComposeDeps) {
  return new Hono<AppEnv>()
    .onError((error, c) => (error instanceof RulesetValidationError ? fail(c, 400, error.message) : fail(c, 500, "internal error")))
    .post("/preview", async (c) => ok(c, await prepare(deps, c.env, await c.req.json())))
    .post("/", async (c) => {
      if (!c.env.ADMIN_TOKEN) return fail(c, 503, "committing is disabled: no ADMIN_TOKEN is configured");
      if (!isOwner(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return fail(c, 401, "owner token required to commit");

      const { ruleset, hash } = await prepare(deps, c.env, await c.req.json());
      if (await repo.rulesetJsonByHash(c.env.DB, hash)) return fail(c, 409, "this exact ruleset was already submitted");

      await store.savePendingRuleset(c.env.DB, ruleset, hash, Date.now());
      try {
        await deps.bridge(c.env).commitRuleset(ruleset);
      } catch (error) {
        await store.failRuleset(c.env.DB, hash);
        return fail(c, 502, `CRE did not accept the commit: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      return c.json({ success: true, data: { hash, effectiveFrom: ruleset.effectiveFrom, status: "pending" } }, 202);
    });
}
