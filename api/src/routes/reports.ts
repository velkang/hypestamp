import { Hono } from "hono";
import { complianceReport } from "../reports/compliance";
import { ok, type AppEnv } from "./respond";

export const reports = new Hono<AppEnv>().get("/compliance", async (c) =>
  ok(c, await complianceReport(c.env.DB, Date.now())),
);
