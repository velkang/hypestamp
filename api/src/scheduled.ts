import OpenAI from "openai";
import type { Hex } from "viem";
import { closePositions } from "./agent/exits";
import { runAgentCycle } from "./agent/cycle";
import { parseEnv } from "./env";
import { sepoliaLedger } from "./ledger/client";
import { reconcileStamps } from "./ledger/reconcile";
import { createBridgeClient } from "./stamp/bridge-client";

export type WorkerEnv = Record<string, unknown> & { DB: D1Database };

// Keep independent stages running even if a provider or the model fails.
async function attempt<T>(run: () => Promise<T>) {
  try { return await run(); }
  catch (error) { return { status: "error" as const, error: error instanceof Error ? error.message : String(error) }; }
}

// Confirm earlier entries, free closed slots, then decide new entries.
export async function runScheduled(rawEnv: WorkerEnv, now: number) {
  const env = parseEnv(rawEnv);
  const bridge = createBridgeClient({ fetch, url: env.BRIDGE_URL, token: env.BRIDGE_TOKEN });
  const reconcile = await attempt(() => reconcileStamps({
    db: rawEnv.DB,
    ledger: sepoliaLedger(env.SEPOLIA_RPC_URL, env.LEDGER_ADDRESS as Hex),
    now,
    startBlock: env.LEDGER_START_BLOCK,
  }));
  const exits = await attempt(() => closePositions({ db: rawEnv.DB, fetch, now }));
  const cycle = await attempt(() => runAgentCycle({
    db: rawEnv.DB,
    now,
    fetch,
    twitterApiKey: env.TWITTERAPI_KEY,
    model: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    submitStamp: bridge.submitStamp,
  }));
  return { reconcile, exits, cycle };
}
