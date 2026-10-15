import { Hono } from "hono";
import { reports } from "./routes/reports";
import { fail, type AppEnv } from "./routes/respond";
import { rulesets } from "./routes/rulesets";
import { trades } from "./routes/trades";

export const app = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/v1/rulesets", rulesets)
  .route("/v1/trades", trades)
  .route("/v1/reports", reports)
  .onError((error, c) => {
    console.error("request failed", error);
    return fail(c, 500, "internal error");
  });
