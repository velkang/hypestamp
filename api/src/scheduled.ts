import OpenAI from "openai";
import type { Hex } from "viem";
import { runAgentCycle } from "./agent/cycle";
import { parseEnv } from "./env";
import { sepoliaLedger } from "./ledger/client";
import { reconcileStamps } from "./ledger/reconcile";
import { createBridgeClient } from "./stamp/bridge-client";

export type WorkerEnv = Record<string, unknown> & { DB: D1Database };

// One cron tick: act on new tweets, then confirm earlier stamps from the ledger.
export async function runScheduled(rawEnv: WorkerEnv, now: number) {
  const env = parseEnv(rawEnv);
  const bridge = createBridgeClient({ fetch, url: env.BRIDGE_URL, token: env.BRIDGE_TOKEN });

  const cycle = await runAgentCycle({
    db: rawEnv.DB,
    now,
    fetch,
    twitterApiKey: env.TWITTERAPI_KEY,
    model: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    submitStamp: bridge.submitStamp,
  });

  const reconcile = await reconcileStamps({
    db: rawEnv.DB,
    ledger: sepoliaLedger(env.SEPOLIA_RPC_URL, env.LEDGER_ADDRESS as Hex),
    now,
    startBlock: env.LEDGER_START_BLOCK,
  });

  return { cycle, reconcile };
}
