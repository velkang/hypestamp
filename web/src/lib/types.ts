// Shapes returned by the api Worker's /v1 routes.
export type Side = "long" | "short";

export type Mention = { token: string; sentiment: number; conviction: number; urgency: number };

export type Extraction = {
  tweetId: string;
  author: string;
  postedAt: number;
  mentions: Mention[];
  isPromo: boolean;
  hasDisclosure: boolean;
  rationale: string;
};

export type FeedPost = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  postedAt: number;
  extraction: Extraction | null;
  citedBy: number[];
};

export type Feed = { window: { from: number; to: number } | null; posts: FeedPost[] };

export type Status = {
  activeRuleset: { hash: string; effectiveFrom: number; model: string; sources: number; windowHours: number } | null;
  demo: boolean;
  trades: { submitted: number; stamped: number; failed: number };
};

export type SignalKol = { handle: string; trustWeight: number; tweetId: string; sentiment: number; conviction: number };

export type StampRequest = {
  rulesetHash: string;
  signal: { token: string; coingeckoId: string; side: Side };
  tweetIds: string[];
  extractionsHash: string;
  riskContextHash?: string;
  trade: { sizePct: number; stopLossPct: number; takeProfitPct: number };
  flags: number;
  observedAt: number;
};

export type Trade = {
  id: number;
  rulesetHash: string;
  token: string;
  side: Side;
  status: "submitted" | "stamped" | "failed";
  bundleHash: string | null;
  entryPriceE8: string | null;
  txHash: string | null;
  submittedAt: number;
  stampedAt: number | null;
  isDemo: boolean;
  openTokens: string[] | null;
  failureReason: "submission-failed" | "stamp-timeout" | null;
  closedAt: number | null;
  exitPriceE8: string | null;
  exitPriceAt: number | null;
  exitReason: "stop-loss" | "take-profit" | null;
  pnl: { returnPct: number; bookContributionPct: number } | null;
  request: StampRequest;
  flags: string[];
  explanation: string;
  kols: SignalKol[];
  replayVerdict?: Replay["verdict"];
  posts?: { id: string; author: string; text: string; createdAt: string }[]; // only on /v1/trades/:id
};

export type ReplayCheck = { name: "ruleset" | "signal" | "request" | "bundle"; status: "pass" | "fail" | "pending"; detail: string };
export type Replay = { tradeId: number; verdict: "match" | "mismatch" | "pending"; checks: ReplayCheck[] };

export type RulesetStatus = "pending" | "confirmed" | "failed";

export type RulesetSummary = {
  hash: string;
  effectiveFrom: number;
  model: string;
  sources: number;
  committedAt: number;
  commitTx: string | null;
};

export type AdminRuleset = RulesetSummary & { status: RulesetStatus };

export type AdminOverview = {
  agent: { lastFetchAt: number | null; lastSyncedBlock: string | null; bridgeUp: boolean };
  trades: { submitted: number; stamped: number; failed: number };
  rulesets: AdminRuleset[];
};

export type RulesetPreview = { ruleset: Ruleset; hash: string; cooldown: number };
export type CommitResult = { hash: string; effectiveFrom: number; status: RulesetStatus };

export type Ruleset = {
  version: number;
  effectiveFrom: number;
  sources: { handle: string; trustWeight: number }[];
  extraction: { model: string; promptHash: string; schemaVersion: number };
  converge: { minKols: number; windowHours: number; minConviction: number; minTrustSum: number };
  risk: { maxPositionPct: number; stopLossPct: number; takeProfitPct: number; maxOpen: number };
  flags: { burstMinutes: number; burstMinKols: number; promoKeywords: string[] };
};

export type RulesetDetail = { hash: string; verified: boolean; ruleset: Ruleset };

export type PromotionStats = { author: string; posts: number; promo: number; promoWithoutDisclosure: number };

export type ComplianceReport = {
  generatedAt: string;
  activeRuleset: string | null;
  rulesets: number;
  trades: { total: number; submitted: number; stamped: number; failed: number };
  replay: { match: number; mismatch: number; pending: number };
  flagged: Record<string, number>;
  promotion: PromotionStats[];
};


export type ReportPeriod = { startDate: string; endDate: string; from: number; to: number; timeZone: "UTC"; partial: boolean };
export type ReportSummary = {
  id: string; schemaVersion: 1; source: "daily" | "manual"; generatedAt: string; period: ReportPeriod;
  coverage: { demo: number; live: number };
  summary: { total: number; submitted: number; stamped: number; failed: number;
    replay: { match: number; mismatch: number; pending: number }; flagged: Record<string, number> };
};
export type SavedReport = ReportSummary & {
  trades: (Pick<Trade, "id" | "token" | "side" | "isDemo" | "submittedAt" | "status" | "rulesetHash" | "entryPriceE8" | "bundleHash" | "txHash" | "closedAt" | "exitPriceE8" | "exitPriceAt" | "exitReason" | "pnl" | "flags" | "explanation" | "kols"> & { replay: Replay })[];
  rulesets: { hash: string; ruleset: Ruleset; status: string; commitTx: string | null }[];
  promotion: PromotionStats[];
  methodology: { promotionPromptHash: string | null; tradeScope: string; outcomes: string; evidence: string };
};
