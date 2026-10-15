import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type AppEnv = { Bindings: { DB: D1Database } };

export const ok = <T>(c: Context, data: T) => c.json({ success: true, data });
export const fail = (c: Context, status: ContentfulStatusCode, error: string) =>
  c.json({ success: false, error }, status);
