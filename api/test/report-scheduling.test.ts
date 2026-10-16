import { afterEach, expect, it, vi } from "vitest";
import worker from "../src/index";
import { runScheduled } from "../src/scheduled";
import { ensureDailyReport } from "../src/reports/saved";
vi.mock("../src/scheduled",()=>({runScheduled:vi.fn()}));
vi.mock("../src/reports/saved",()=>({ensureDailyReport:vi.fn()}));
afterEach(()=>vi.restoreAllMocks());
it("completes reporting even when the agent tick rejects",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  vi.spyOn(console,"info").mockImplementation(()=>{});
  vi.mocked(runScheduled).mockRejectedValue(new Error("provider unavailable"));
  vi.mocked(ensureDailyReport).mockResolvedValue({id:"daily-2026-10-15"});
  let completion:Promise<unknown> | undefined;
  const db={} as D1Database;
  worker.scheduled({} as ScheduledController,{DB:db} as Parameters<typeof worker.scheduled>[1],{waitUntil:(promise:Promise<unknown>)=>{completion=promise;}} as ExecutionContext);
  await completion;
  expect(ensureDailyReport).toHaveBeenCalledWith(db,expect.any(Number));
  expect(console.info).toHaveBeenCalledWith("daily report",JSON.stringify({id:"daily-2026-10-15"}));
});
