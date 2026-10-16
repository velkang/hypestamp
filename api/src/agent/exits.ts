import * as repo from "../db";
import { parseStampRequest } from "../stamp/bundle";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const MAX_PRICE_AGE_MS = 10 * 60_000;

export function positionReturnPct(side: "long" | "short", entry: string, exit: string): number {
  const entryPrice = BigInt(entry);
  const exitPrice = BigInt(exit);
  if (entryPrice <= 0n || exitPrice <= 0n) throw new Error("Position prices must be positive");
  const change = side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return Number(change) / Number(entryPrice) * 100;
}

// Compare fixed-point prices exactly, including fractional percentages. Converting
// to a floating return first can miss an exact boundary (e.g. 0.07%).
function reachesPercent(change: bigint, entry: bigint, percent: number): boolean {
  if (change < 0n) return false;
  const [coefficient, exponent = "0"] = percent.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const numerator = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent);
  return scale >= 0
    ? change * 100n * 10n ** BigInt(scale) >= entry * numerator
    : change * 100n >= entry * numerator * 10n ** BigInt(-scale);
}

export function realizedPnl(trade: Pick<repo.TradeRow, "closedAt" | "entryPriceE8" | "exitPriceE8" | "side" | "requestJson">) {
  if (trade.closedAt === null || !trade.entryPriceE8 || !trade.exitPriceE8) return null;
  const returnPct = positionReturnPct(trade.side, trade.entryPriceE8, trade.exitPriceE8);
  const { sizePct } = parseStampRequest(JSON.parse(trade.requestJson)).trade;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { returnPct: round(returnPct), bookContributionPct: round(returnPct * sizePct / 100) };
}

// Entries are CRE-attested. Exits are off-chain paper fills at the price observed
// on a cron tick, not guaranteed fills at a threshold or a record of intratick prices.
export async function closePositions({ db, fetch, now }: { db: D1Database; fetch: typeof globalThis.fetch; now: number }) {
  const trades = (await repo.listTrades(db)).filter((t) => t.status === "stamped" && t.closedAt === null && !t.isDemo);
  const closed: number[] = [];
  const errors: string[] = [];
  if (trades.length === 0) return { closed, errors };

  const requests = new Map(trades.map((t) => [t.id, parseStampRequest(JSON.parse(t.requestJson))]));
  const ids = [...new Set([...requests.values()].map((r) => r.signal.coingeckoId))];
  const url = new URL(PRICE_URL);
  url.search = new URLSearchParams({ ids: ids.join(","), vs_currencies: "usd", include_last_updated_at: "true" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Exit price request failed with status ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid exit price response");

  for (const trade of trades) {
    try {
      const request = requests.get(trade.id)!;
      const quote = (body as Record<string, unknown>)[request.signal.coingeckoId] as { usd?: unknown; last_updated_at?: unknown } | null;
      const usd = quote?.usd;
      const updatedAt = quote?.last_updated_at;
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 ||
          !Number.isSafeInteger(Math.round(usd * 1e8)) || Math.round(usd * 1e8) <= 0) {
        throw new Error("missing or invalid USD price");
      }
      if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) ||
          updatedAt * 1000 > now || now - updatedAt * 1000 > MAX_PRICE_AGE_MS ||
          updatedAt * 1000 < (trade.stampedAt ?? trade.submittedAt)) {
        throw new Error("missing, stale or pre-entry price timestamp");
      }
      if (!trade.entryPriceE8) throw new Error("missing stamped entry price");
      const priceE8 = BigInt(Math.round(usd * 1e8)).toString();
      const entry = BigInt(trade.entryPriceE8);
      if (entry <= 0n) throw new Error("invalid stamped entry price");
      const change = (BigInt(priceE8) - entry) * (trade.side === "long" ? 1n : -1n);
      const reason = reachesPercent(-change, entry, request.trade.stopLossPct) ? "stop-loss"
        : reachesPercent(change, entry, request.trade.takeProfitPct) ? "take-profit" : null;
      if (reason && await repo.closeTrade(db, trade.id, { priceE8, priceAt: updatedAt * 1000, closedAt: now, reason })) {
        closed.push(trade.id);
      }
    } catch (error) {
      errors.push(`${trade.token} (${trade.id}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { closed, errors };
}
