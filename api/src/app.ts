import { Hono } from "hono";
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { composeRoutes, type ComposeDeps } from "./routes/compose";
import { feed } from "./routes/feed";
import { reports } from "./routes/reports";
import { fail, type AppBindings, type AppEnv } from "./routes/respond";
import { rulesets } from "./routes/rulesets";
import { status } from "./routes/status";
import { trades } from "./routes/trades";
import { createBridgeClient } from "./stamp/bridge-client";

function required(env: AppBindings, name: keyof AppBindings): string {
  const value = env[name];
  if (typeof value !== "string" || !value) throw new Error(`${name} is not configured`);
  return value;
}

const cooldownAbi = parseAbi(["function cooldown() view returns (uint64)"]);

// The ledger's own clock and cooldown decide the earliest effectiveFrom it accepts.
const liveDeps: ComposeDeps = {
  async chainState(env) {
    const client = createPublicClient({ chain: sepolia, transport: http(required(env, "SEPOLIA_RPC_URL")) });
    const [block, cooldown] = await Promise.all([
      client.getBlock(),
      client.readContract({ address: required(env, "LEDGER_ADDRESS") as Hex, abi: cooldownAbi, functionName: "cooldown" }),
    ]);
    return { chainNow: Number(block.timestamp), cooldown: Number(cooldown) };
  },
  bridge: (env) => createBridgeClient({ fetch, url: required(env, "BRIDGE_URL"), token: required(env, "BRIDGE_TOKEN") }),
};

export function createApp(deps: ComposeDeps = liveDeps) {
  return new Hono<AppEnv>()
    .get("/health", (c) => c.json({ status: "ok" }))
    .route("/v1/status", status)
    .route("/v1/feed", feed)
    .route("/v1/rulesets", composeRoutes(deps))
    .route("/v1/rulesets", rulesets)
    .route("/v1/trades", trades)
    .route("/v1/reports", reports)
    .onError((error, c) => {
      console.error("request failed", error);
      return fail(c, 500, "internal error");
    });
}

export const app = createApp();
