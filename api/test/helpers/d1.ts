import { readdirSync, readFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";

// A real local D1 (workerd) with the migrations applied, discarded after the tests.
export async function createTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", persist: false });
  const statements = readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(`migrations/${file}`, "utf8"))
    .join(";\n")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((sql) => sql.trim())
    .filter(Boolean);
  await proxy.env.DB.batch(statements.map((sql) => proxy.env.DB.prepare(sql)));
  return { db: proxy.env.DB, dispose: proxy.dispose };
}
