import { describe, expect, it } from "vitest";
import { decideTrade } from "../src/agent/risk";
import type { Signal } from "../src/agent/types";
import { demoRuleset } from "./fixtures/ruleset";

// demoRuleset risk: maxPositionPct 5, stopLossPct 8, takeProfitPct 20, maxOpen 3.
const signal = (token: string, avgConviction = 0.8): Signal => ({
  token,
  side: "long",
  kols: [],
  trustSum: 1.7,
  avgConviction,
  explanation: "",
});

describe("decideTrade", () => {
  it("sizes the position by conviction within the ruleset's maximum", () => {
    expect(decideTrade(demoRuleset, signal("LINK", 0.8), [])).toEqual({
      accepted: true,
      trade: { token: "LINK", coingeckoId: "chainlink", side: "long", sizePct: 4, stopLossPct: 8, takeProfitPct: 20 },
    });
  });

  it("rounds the size to two decimals", () => {
    const decision = decideTrade(demoRuleset, signal("ETH", 0.6667), []);
    expect(decision.accepted && decision.trade.sizePct).toBe(3.33);
  });

  it("rejects a token that already has an open position", () => {
    expect(decideTrade(demoRuleset, signal("LINK"), ["LINK"])).toEqual({
      accepted: false,
      reason: "LINK already has an open position",
    });
  });

  it("rejects when the maximum number of open positions is reached", () => {
    expect(decideTrade(demoRuleset, signal("LINK"), ["ETH", "SOL", "BTC"])).toEqual({
      accepted: false,
      reason: "max open positions (3) reached",
    });
  });

  it("rejects tokens without a known price source", () => {
    expect(decideTrade(demoRuleset, signal("NOTACOIN"), [])).toEqual({
      accepted: false,
      reason: "no price source for NOTACOIN",
    });
  });
});
