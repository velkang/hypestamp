import { describe, expect, it, vi } from "vitest";
import { sepoliaLedger } from "../src/ledger/client";

const { getLogs } = vi.hoisted(() => ({ getLogs: vi.fn().mockResolvedValue([]) }));
vi.mock("viem", async (original) => ({
  ...await original<typeof import("viem")>(),
  createPublicClient: () => ({ getLogs }),
}));

describe("Sepolia log pagination", () => {
  it.each(["stampedEvents", "committedRulesets"] as const)("keeps %s requests within the provider's 1,000-block limit", async (method) => {
    getLogs.mockClear();
    const ledger = sepoliaLedger("https://example.com", `0x${"12".repeat(20)}`);
    await ledger[method](100n, 2300n);
    expect(getLogs.mock.calls.map(([request]) => [request.fromBlock, request.toBlock])).toEqual([
      [100n, 1099n], [1100n, 2099n], [2100n, 2300n],
    ]);
  });
});
