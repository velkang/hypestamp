import { ensureDailyReport } from "./reports/saved";
import { app } from "./app";
import { runScheduled, type WorkerEnv } from "./scheduled";

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    const now = Date.now();
    ctx.waitUntil(Promise.allSettled([
      runScheduled(env, now),
      ensureDailyReport(env.DB, now),
    ]).then((results) => {
      results.forEach((result, index) => {
        const stage = index === 0 ? "agent tick" : "daily report";
        if (result.status === "rejected") console.error(`${stage} failed`, result.reason);
        else console.info(stage, JSON.stringify(result.value, (_k, value) => typeof value === "bigint" ? value.toString() : value));
      });
    }));
  },
};
