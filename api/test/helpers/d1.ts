import { readFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";

// A real local D1 (workerd) with the migrations applied, discarded after the tests.
export async function createTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", persist: false });
  const statements = readFileSync("migrations/0001_init.sql", "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((sql) => sql.trim())
    .filter(Boolean);
  await proxy.env.DB.batch(statements.map((sql) => proxy.env.DB.prepare(sql)));
  return { db: proxy.env.DB, dispose: proxy.dispose };
}
