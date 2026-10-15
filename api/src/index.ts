import { app } from "./app";
import { runScheduled, type WorkerEnv } from "./scheduled";

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduled(env, Date.now()).then(
        (result) => console.info("agent tick", JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
        (error) => console.error("agent tick failed", error),
      ),
    );
  },
};
