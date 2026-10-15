export type Side = "long" | "short";

export type Mention = {
  token: string;
  sentiment: number; // -1 bearish .. 1 bullish
  conviction: number; // 0..1
  urgency: number; // 0..1
};

export type Extraction = {
  tweetId: string;
  author: string;
  postedAt: number; // epoch ms
  mentions: Mention[];
  isPromo: boolean;
  hasDisclosure: boolean;
  rationale: string;
};

export type SignalKol = {
  handle: string;
  trustWeight: number;
  tweetId: string;
  sentiment: number;
  conviction: number;
};

export type Signal = {
  token: string;
  side: Side;
  kols: SignalKol[];
  trustSum: number;
  avgConviction: number;
  explanation: string;
};
