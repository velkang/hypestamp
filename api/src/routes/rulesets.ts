import { Hono } from "hono";
import * as repo from "../db";
import { parseRuleset } from "../rulesets/schema";
import { rulesetHash } from "../stamp/encoding";
import { fail, ok, type AppEnv } from "./respond";

const HASH = /^0x[0-9a-f]{64}$/;

export const rulesets = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await repo.listRulesets(c.env.DB);
    return ok(
      c,
      rows.map((row) => {
        const ruleset = parseRuleset(JSON.parse(row.json));
        return {
          hash: row.hash,
          effectiveFrom: row.effectiveFrom,
          model: ruleset.extraction.model,
          sources: ruleset.sources.length,
          committedAt: row.committedAt,
        };
      }),
    );
  })
  // Anyone can fetch the committed JSON and check it hashes to the on-chain ID.
  .get("/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!HASH.test(hash)) return fail(c, 400, "hash must be 0x followed by 64 lowercase hex characters");
    const json = await repo.rulesetJsonByHash(c.env.DB, hash);
    if (!json) return fail(c, 404, "ruleset not found");
    const ruleset = parseRuleset(JSON.parse(json));
    return ok(c, { hash, verified: rulesetHash(ruleset) === hash, ruleset });
  });
