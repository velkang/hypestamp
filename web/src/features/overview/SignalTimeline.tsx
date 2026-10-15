import { DemoTag, Empty, Panel, PanelHeader } from "../../components/ui";
import { useFeed, useRuleset, useStatus, useTrades } from "../../lib/api";
import { tradeCode, utcClock } from "../../lib/format";
import type { FeedPost } from "../../lib/types";
import { dotFor, xFor, type Dot } from "./timeline";

const W = 1336;
const LEFT = 150;
const PLOT = W - LEFT - 12;
const ROW = 34;
const TOP = 30;

const FILL: Record<Dot["kind"], string> = { bull: "#34D399", bear: "#F26B6B", promo: "#F5B544", none: "#4A4E57" };

function PostMark({ post, x, y }: { post: FeedPost; x: number; y: number }) {
  const dot = dotFor(post);
  const title = `@${post.author} · ${utcClock(post.postedAt)} UTC · ${post.text}`;
  if (dot.kind === "promo") return <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill={FILL.promo}><title>{title}</title></rect>;
  return (
    <g>
      <circle cx={x} cy={y} r={dot.r} fill={FILL[dot.kind]} stroke={dot.kind === "none" ? "none" : "#121316"} strokeWidth={3}><title>{title}</title></circle>
      {dot.label && <text x={x + dot.r + 6} y={y - 6} fontSize={12} fontWeight={600} fill={FILL[dot.kind]}>{dot.label}</text>}
    </g>
  );
}

// Trade nodes that converge at nearly the same point are pushed apart vertically so
// each node and its label stay readable.
const NODE_GAP = 26;
function separate<T extends { tx: number; ty: number }>(nodes: T[]): T[] {
  const sorted = [...nodes].sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (Math.abs(sorted[i].tx - prev.tx) < 160 && sorted[i].ty - prev.ty < NODE_GAP) sorted[i] = { ...sorted[i], ty: prev.ty + NODE_GAP };
  }
  return sorted;
}

export function SignalTimeline() {
  const feed = useFeed();
  const status = useStatus();
  const trades = useTrades();
  const ruleset = useRuleset(status.data?.activeRuleset?.hash);
  const window = feed.data?.window;
  const sources = ruleset.data?.ruleset.sources.map((s) => s.handle) ?? [];

  if (!window || sources.length === 0) {
    return <Panel><PanelHeader title="Signal timeline" /><Empty title="Nothing to plot yet">Posts from the ruleset's sources appear here once a ruleset is in force.</Empty></Panel>;
  }
  const rowOf = new Map(sources.map((h, i) => [h.toLowerCase(), TOP + i * ROW]));
  const x = (at: number) => xFor(at, window, LEFT, PLOT);
  const height = TOP + sources.length * ROW + 20;
  const inWindow = (trades.data ?? []).filter((t) => t.status !== "failed" && t.submittedAt >= window.from);
  const posts = feed.data?.posts ?? [];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => window.from + f * (window.to - window.from));
  const nodes = separate(
    inWindow.map((trade) => {
      const cited = posts.filter((p) => p.citedBy.includes(trade.id));
      const ty = cited.reduce((sum, p) => sum + (rowOf.get(p.author.toLowerCase()) ?? TOP), 0) / Math.max(1, cited.length);
      return { trade, tx: x(trade.submittedAt), ty, cited };
    }),
  );

  return (
    <Panel label="Signal timeline" className="pb-3">
      <PanelHeader title={<>Signal timeline<DemoTag show={Boolean(status.data?.demo)} /></>} meta={`posts from the ${sources.length} sources · ${utcClock(window.from)}–${utcClock(window.to)} UTC`}>
        <ul className="m-0 hidden list-none flex-wrap gap-4 p-0 text-[12.5px] text-ink-muted lg:flex">
          <li><i className="mr-1.5 inline-block size-[9px] rounded-full bg-bull" />bullish</li>
          <li><i className="mr-1.5 inline-block size-[9px] rounded-full bg-bear" />bearish</li>
          <li><i className="mr-1.5 inline-block size-[9px] rounded-full bg-quiet" />no call</li>
          <li><i className="mr-1.5 inline-block size-[9px] rounded-[2px] bg-flag" />promotion, no disclosure</li>
          <li>larger = higher conviction</li>
        </ul>
      </PanelHeader>
      <div className="relative overflow-x-auto px-6">
        <svg viewBox={`0 0 ${W} ${height + 18}`} className="block w-full min-w-[900px]" role="img"
          aria-label={`Posts from ${sources.length} sources over the last ${status.data?.activeRuleset?.windowHours ?? ""} hours, with the trades they led to`}>
          <g fontSize={13} fill="#A3A7AF">
            {sources.map((h, i) => <text key={h} x={0} y={TOP + i * ROW + 4}>@{h}</text>)}
          </g>
          {sources.map((h, i) => <line key={h} x1={LEFT} x2={W - 6} y1={TOP + i * ROW} y2={TOP + i * ROW} stroke="#222428" />)}
          {ticks.map((t, i) => (
            <text key={t} x={i === ticks.length - 1 ? W - 6 : x(t)} y={height + 12} fontSize={12} fill="#8E929B" textAnchor={i === ticks.length - 1 ? "end" : "start"}>{utcClock(t)}</text>
          ))}
          {nodes.map(({ trade, tx, ty, cited }) => {
            return (
              <g key={trade.id}>
                <line x1={tx} x2={tx} y1={TOP - 14} y2={height - 12} stroke="#0B7A55" strokeWidth={1.5} />
                {cited.map((p) => {
                  const py = rowOf.get(p.author.toLowerCase()) ?? TOP;
                  return <path key={p.id} d={`M${x(p.postedAt)} ${py} C ${(x(p.postedAt) + tx) / 2} ${py}, ${tx - 60} ${ty}, ${tx} ${ty}`} fill="none" stroke="#0B7A55" strokeWidth={1.5} strokeDasharray="3 5" />;
                })}
                <circle cx={tx} cy={ty} r={9} fill="#0B7A55" stroke="#121316" strokeWidth={3} />
                <path d={`M${tx - 4} ${ty + 0.5}l2.6 2.6 5-5.4`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <text x={tx - 16} y={ty + 4} textAnchor="end" fontSize={12.5} fontWeight={600} fill="#5EDFAE" paintOrder="stroke" stroke="#121316" strokeWidth={5}>{tradeCode(trade.id)} · {trade.token} {trade.side}</text>
              </g>
            );
          })}
          {posts.map((p) => {
            const y = rowOf.get(p.author.toLowerCase());
            return y === undefined ? null : <PostMark key={p.id} post={p} x={x(p.postedAt)} y={y} />;
          })}
        </svg>
      </div>
    </Panel>
  );
}
