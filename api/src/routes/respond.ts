import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type AppBindings = {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  BRIDGE_URL?: string;
  BRIDGE_TOKEN?: string;
  SEPOLIA_RPC_URL?: string;
  LEDGER_ADDRESS?: string;
};

export type AppEnv = { Bindings: AppBindings };

export const ok = <T>(c: Context, data: T) => c.json({ success: true, data });
export const fail = (c: Context, status: ContentfulStatusCode, error: string) =>
  c.json({ success: false, error }, status);
