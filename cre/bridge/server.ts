// Local stand-in for the CRE gateway: accepts the agent's jobs and runs each one
// through `cre workflow simulate --broadcast`. Bound to localhost only.
//   BRIDGE_TOKEN=... bun cre/bridge/server.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { authorize, createSerialQueue, parseJob, type Job } from "./jobs";

const PORT = Number(process.env.BRIDGE_PORT ?? 8789);
const TOKEN = process.env.BRIDGE_TOKEN;
if (!TOKEN) throw new Error("BRIDGE_TOKEN is not set");

const CRE_DIR = resolve(import.meta.dir, "..");
const twitterApiKey = process.env.TWITTERAPI_KEY ?? readDevVar("TWITTERAPI_KEY");

function readDevVar(name: string): string {
  const line = readFileSync(resolve(CRE_DIR, "../api/.dev.vars"), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not set and not in api/.dev.vars`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
}

const queue = createSerialQueue({ minIntervalMs: 30_000, now: Date.now, sleep: (ms) => Bun.sleep(ms) });

async function simulate(job: Job): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hypestamp-bridge-"));
  const payload = join(dir, "payload.json");
  writeFileSync(payload, JSON.stringify(job));
  try {
    const proc = Bun.spawn(
      ["cre", "workflow", "simulate", "stamp-workflow", "--target", "staging-settings", "--non-interactive",
        "--trigger-index", "0", "--broadcast", "--http-payload", payload],
      { cwd: CRE_DIR, env: { ...process.env, TWITTERAPI_KEY: twitterApiKey }, stdout: "pipe", stderr: "pipe" },
    );
    const output = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
    const code = await proc.exited;
    const summary = output.split("\n").filter((l) => l.includes("USER LOG") || l.includes("✗")).join("\n");
    console.info(`[bridge] ${job.action} exited ${code}\n${summary}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/submit") return new Response("Not found", { status: 404 });
    if (!authorize(request.headers.get("Authorization"), TOKEN)) return new Response("Unauthorized", { status: 401 });

    let job: Job;
    try {
      job = parseJob(await request.json());
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    queue.push(() => simulate(job)).catch((error) => console.error("[bridge] job failed:", error));
    return new Response(null, { status: 202 });
  },
});

console.info(`[bridge] listening on http://127.0.0.1:${PORT}/submit`);
