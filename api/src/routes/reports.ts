import { Hono } from "hono";
import { complianceReport } from "../reports/compliance";
import { generateReport, getSavedReport, listSavedReports, ReportRangeError } from "../reports/saved";
import { fail, ok, type AppEnv } from "./respond";

export const reports = new Hono<AppEnv>()
  .get("/compliance", async (c) => ok(c, await complianceReport(c.env.DB, Date.now())))
  .get("/", async (c) => ok(c, await listSavedReports(c.env.DB)))
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^(daily-\d{4}-\d{2}-\d{2}|[0-9a-f-]{36})$/.test(id)) return fail(c, 400, "invalid report ID");
    const report = await getSavedReport(c.env.DB, id);
    return report ? ok(c, report) : fail(c, 404, "report not found");
  });

// Mounted behind the existing owner middleware, never on the public router.
export const adminReports = new Hono<AppEnv>().post("/", async (c) => {
  let input: unknown;
  try { input = await c.req.json(); } catch { return fail(c, 400, "a JSON date range is required"); }
  try {
    const report = await generateReport(c.env.DB, input, Date.now());
    return c.json({ success: true, data: report }, 201);
  } catch (error) {
    if (error instanceof ReportRangeError) return fail(c, 400, error.message);
    throw error;
  }
});
