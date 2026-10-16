import type { AdminOverview, ComplianceReport, Feed, Replay, RulesetDetail, RulesetSummary, Status, Trade } from "../../src/lib/types";

export const NOW = Date.UTC(2026, 9, 15, 16, 30);
const HASH = `0x57e7${"a".repeat(56)}a766`;

export const status: Status = {
  activeRuleset: { hash: HASH, effectiveFrom: (NOW - 3_600_000) / 1000, model: "gpt-6-luna", sources: 2, windowHours: 12 },
  demo: true,
  trades: { submitted: 0, stamped: 1, failed: 1 },
};

const trade = (over: Partial<Trade>): Trade => ({
  id: 1, rulesetHash: HASH, token: "ETH", side: "long", status: "stamped",
  bundleHash: `0x2bc4${"b".repeat(56)}3840`, entryPriceE8: "237148000000", txHash: "demo",
  submittedAt: NOW - 600_000, stampedAt: NOW - 500_000, isDemo: true,
  request: { rulesetHash: HASH, signal: { token: "ETH", coingeckoId: "ethereum", side: "long" }, tweetIds: ["11", "12"], extractionsHash: `0xd429${"c".repeat(56)}aab7`, trade: { sizePct: 4.25, stopLossPct: 8, takeProfitPct: 20 }, flags: 0, observedAt: (NOW - 600_000) / 1000 },
  openTokens: [], failureReason: null, closedAt: null, exitPriceE8: null, exitPriceAt: null, exitReason: null, pnl: null,
  flags: [], explanation: "ETH long: 2 KOLs within 12h (cobie 0.9 conv 0.80, CryptoHayes 0.8 conv 0.85); trust 1.70 >= 1.3",
  kols: [{ handle: "cobie", trustWeight: 0.9, tweetId: "11", sentiment: 0.8, conviction: 0.8 }, { handle: "CryptoHayes", trustWeight: 0.8, tweetId: "12", sentiment: 0.9, conviction: 0.85 }],
  ...over,
});

export const trades: Trade[] = [
  trade({ id: 2, token: "LINK", status: "failed", entryPriceE8: null, bundleHash: null, txHash: null, stampedAt: null, submittedAt: NOW - 3_700_000 }),
  trade({}),
];

export const tradeDetail: Trade = {
  ...trades[1],
  posts: [
    { id: "11", author: "cobie", text: "ETH looks ready. Adding.", createdAt: "Thu Oct 15 10:00:00 +0000 2026" },
    { id: "12", author: "CryptoHayes", text: "Rotating into ETH here.", createdAt: "Thu Oct 15 12:00:00 +0000 2026" },
  ],
};

export const replay: Replay = {
  tradeId: 1,
  verdict: "match",
  checks: [
    { name: "ruleset", status: "pass", detail: `stored ruleset hashes to the committed ${HASH}` },
    { name: "signal", status: "pass", detail: "ETH long: 2 KOLs within 12h" },
    { name: "request", status: "pass", detail: "rebuilt stamp request is identical, including extractionsHash" },
    { name: "bundle", status: "pass", detail: "recomputes to the on-chain bundle" },
  ],
};

const post = (id: string, author: string, hoursAgo: number, extraction: Partial<NonNullable<Feed["posts"][0]["extraction"]>> | null, citedBy: number[] = []) => ({
  id, author, text: `post ${id}`, createdAt: "", postedAt: NOW - hoursAgo * 3_600_000, citedBy,
  extraction: extraction && { tweetId: id, author, postedAt: NOW - hoursAgo * 3_600_000, mentions: [], isPromo: false, hasDisclosure: false, rationale: "", ...extraction },
});

export const feed: Feed = {
  window: { from: NOW - 12 * 3_600_000, to: NOW },
  posts: [
    post("13", "CryptoHayes", 1, { isPromo: true }),
    post("12", "CryptoHayes", 4, { mentions: [{ token: "ETH", sentiment: 0.9, conviction: 0.85, urgency: 0.4 }] }, [1]),
    post("11", "cobie", 6, { mentions: [{ token: "ETH", sentiment: 0.8, conviction: 0.8, urgency: 0.4 }] }, [1]),
    post("10", "cobie", 8, { mentions: [{ token: "SOL", sentiment: -0.6, conviction: 0.7, urgency: 0.4 }] }),
  ],
};

export const rulesets: RulesetSummary[] = [{ hash: HASH, effectiveFrom: (NOW - 3_600_000) / 1000, model: "gpt-6-luna", sources: 2, committedAt: NOW - 3_780_000, commitTx: null }];

export const rulesetDetail: RulesetDetail = {
  hash: HASH,
  verified: true,
  ruleset: {
    version: 1, effectiveFrom: (NOW - 3_600_000) / 1000,
    sources: [{ handle: "cobie", trustWeight: 0.9 }, { handle: "CryptoHayes", trustWeight: 0.8 }],
    extraction: { model: "gpt-6-luna", promptHash: `0x99ea${"d".repeat(56)}7cd7`, schemaVersion: 1 },
    converge: { minKols: 2, windowHours: 12, minConviction: 0.6, minTrustSum: 1.3 },
    risk: { maxPositionPct: 5, stopLossPct: 8, takeProfitPct: 20, maxOpen: 3 },
    flags: { burstMinutes: 15, burstMinKols: 3, promoKeywords: ["#ad", "sponsored"] },
  },
};

export const report: ComplianceReport = {
  generatedAt: new Date(NOW).toISOString(), activeRuleset: HASH, rulesets: 1,
  trades: { total: 2, submitted: 0, stamped: 1, failed: 1 },
  replay: { match: 1, mismatch: 0, pending: 0 },
  flagged: { "undisclosed-promo": 0, "coordinated-burst": 0, "paid-marker": 0 },
  promotion: [{ author: "CryptoHayes", posts: 2, promo: 1, promoWithoutDisclosure: 1 }],
};

export const preview = { ruleset: rulesetDetail.ruleset, hash: `0x7f3e${"e".repeat(56)}12ab`, cooldown: 120 };

export const adminOverview: AdminOverview = {
  agent: { lastFetchAt: NOW - 120_000, lastSyncedBlock: "11921132", bridgeUp: true },
  trades: { submitted: 0, stamped: 1, failed: 1 },
  rulesets: [{ ...rulesets[0], status: "confirmed" }],
};

export const API: Record<string, unknown> = {
  "/v1/status": status,
  "/v1/feed": feed,
  "/v1/trades": trades,
  "/v1/trades/1": tradeDetail,
  "/v1/trades/1/replay": replay,
  "/v1/trades/2/replay": { ...replay, tradeId: 2, verdict: "pending" },
  "/v1/rulesets": rulesets,
  [`/v1/rulesets/${HASH}`]: rulesetDetail,
  "/v1/reports/compliance": report,
  "/v1/admin/overview": adminOverview,
  "POST /v1/admin/rulesets/preview": preview,
  "POST /v1/admin/rulesets": { hash: preview.hash, effectiveFrom: NOW / 1000 + 180, status: "pending" },
};
