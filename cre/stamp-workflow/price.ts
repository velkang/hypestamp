import { consensusMedianAggregation, HTTPClient, json, ok, type NodeRuntime, type Runtime } from "@chainlink/cre-sdk";
import type { Config } from "./config";

const E8 = 100_000_000;

export function parsePriceE8(body: unknown, coingeckoId: string): bigint {
  const usd = (body as Record<string, { usd?: number }> | null)?.[coingeckoId]?.usd;
  if (typeof usd !== "number" || !(usd > 0)) throw new Error(`No USD price for ${coingeckoId}`);
  return BigInt(Math.round(usd * E8));
}

// Each node fetches the price itself; the DON agrees on the median, so one bad
// response cannot set the entry price.
export function fetchEntryPriceE8(runtime: Runtime<Config>, coingeckoId: string): bigint {
  const fetchPrice = (nodeRuntime: NodeRuntime<Config>): bigint => {
    const response = new HTTPClient()
      .sendRequest(nodeRuntime, {
        url: `${nodeRuntime.config.priceApiUrl}?ids=${coingeckoId}&vs_currencies=usd`,
        method: "GET",
      })
      .result();
    if (!ok(response)) throw new Error(`Price request failed with status ${response.statusCode}`);
    return parsePriceE8(json(response), coingeckoId);
  };

  return runtime.runInNodeMode(fetchPrice, consensusMedianAggregation<bigint>())().result();
}
