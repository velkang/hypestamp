// Pure: replay re-runs this with the same open positions and must reach the same decision.
import type { Ruleset } from "../rulesets/schema";
import { COINGECKO_IDS } from "./tokens";
import type { Side, Signal } from "./types";

export type Trade = {
  token: string;
  coingeckoId: string;
  side: Side;
  sizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
};

export type TradeDecision = { accepted: true; trade: Trade } | { accepted: false; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

// Entry, size and exits are decided together, as one decision.
export function decideTrade(ruleset: Ruleset, signal: Signal, openTokens: string[]): TradeDecision {
  const coingeckoId = COINGECKO_IDS[signal.token];
  if (!coingeckoId) return { accepted: false, reason: `no price source for ${signal.token}` };
  if (openTokens.includes(signal.token)) {
    return { accepted: false, reason: `${signal.token} already has an open position` };
  }
  if (openTokens.length >= ruleset.risk.maxOpen) {
    return { accepted: false, reason: `max open positions (${ruleset.risk.maxOpen}) reached` };
  }

  return {
    accepted: true,
    trade: {
      token: signal.token,
      coingeckoId,
      side: signal.side,
      sizePct: round2(ruleset.risk.maxPositionPct * signal.avgConviction),
      stopLossPct: ruleset.risk.stopLossPct,
      takeProfitPct: ruleset.risk.takeProfitPct,
    },
  };
}
