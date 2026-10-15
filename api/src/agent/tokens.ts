// Tickers the agent can price. CoinGecko IDs feed the CRE price fetch; a signal on a
// ticker outside this list is rejected rather than priced from a guessed ID.
export const COINGECKO_IDS: Readonly<Record<string, string>> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  LINK: "chainlink",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  HYPE: "hyperliquid",
  ENA: "ethena",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  TAO: "bittensor",
  AAVE: "aave",
  UNI: "uniswap",
};
