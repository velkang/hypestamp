import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentCycle } from "../src/agent/cycle";
import { closePositions } from "../src/agent/exits";
import { reconcileStamps } from "../src/ledger/reconcile";
import { runScheduled, type WorkerEnv } from "../src/scheduled";

vi.mock("../src/agent/cycle", () => ({ runAgentCycle: vi.fn() }));
vi.mock("../src/agent/exits", () => ({ closePositions: vi.fn() }));
vi.mock("../src/ledger/reconcile", () => ({ reconcileStamps: vi.fn() }));
const env = {
  DB: {} as D1Database, TWITTERAPI_KEY: "test", OPENAI_API_KEY: "test", BRIDGE_URL: "http://localhost:8789", BRIDGE_TOKEN: "test",
  SEPOLIA_RPC_URL: "https://example.com", LEDGER_ADDRESS: `0x${"12".repeat(20)}`, LEDGER_START_BLOCK: "1",
} satisfies WorkerEnv;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runAgentCycle).mockResolvedValue({ status: "no-active-ruleset" });
  vi.mocked(closePositions).mockResolvedValue({ closed: [], errors: [] });
  vi.mocked(reconcileStamps).mockResolvedValue({ fromBlock: 1n, toBlock: 1n, stamped: [], failed: [], confirmedRulesets: [], failedRulesets: [] });
});

describe("scheduled stages", () => {
  it("reconciles and checks exits before opening new positions", async () => {
    await runScheduled(env, 1000);
    expect(vi.mocked(reconcileStamps).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(closePositions).mock.invocationCallOrder[0]);
    expect(vi.mocked(closePositions).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runAgentCycle).mock.invocationCallOrder[0]);
  });

  it("reports extraction errors without losing reconciliation and exits", async () => {
    vi.mocked(runAgentCycle).mockRejectedValue(new Error("model unavailable"));
    const result = await runScheduled(env, 1000);
    expect(result.cycle).toEqual({ status: "error", error: "model unavailable" });
    expect(result.reconcile).toHaveProperty("toBlock", 1n);
    expect(result.exits).toEqual({ closed: [], errors: [] });
  });

  it("runs remaining stages when the RPC and price providers fail", async () => {
    vi.mocked(reconcileStamps).mockRejectedValue(new Error("RPC unavailable"));
    vi.mocked(closePositions).mockRejectedValue(new Error("prices unavailable"));
    const result = await runScheduled(env, 1000);
    expect(result.reconcile).toEqual({ status: "error", error: "RPC unavailable" });
    expect(result.exits).toEqual({ status: "error", error: "prices unavailable" });
    expect(result.cycle).toEqual({ status: "no-active-ruleset" });
  });
});
