import { Link, useParams } from "react-router";
import { ExternalIcon, TokenMark } from "../../components/icons";
import { Badge, DemoTag, Failure, Hash, Loading, Panel, PanelHeader } from "../../components/ui";
import { useTrade } from "../../lib/api";
import { signed, tradeCode, usdFromE8, utcClock, utcDate } from "../../lib/format";
import { isRealTx, postUrl, txUrl } from "../../lib/links";
import type { Trade } from "../../lib/types";
import { ReplayPanel } from "./ReplayPanel";

function Header({ trade }: { trade: Trade }) {
  const badge = trade.status === "stamped" ? <Badge tone="ok" icon="check">Stamped on-chain</Badge>
    : trade.status === "failed" ? <Badge tone="bad" icon="cross">Refused by the ledger</Badge>
    : <Badge tone="quiet">Awaiting stamp</Badge>;
  return (
    <div className="flex flex-col gap-2">
      <Link to="/trades" className="text-[13.5px]">← All trades</Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px] text-ink-muted">{tradeCode(trade.id)}</span>
        {badge}<DemoTag show={trade.isDemo} />
      </div>
      <h1 className="m-0 flex flex-wrap items-center gap-3 text-[30px] font-bold tracking-[-0.02em]">
        <TokenMark token={trade.token} size={32} />{trade.token}
        <span className={trade.side === "long" ? "text-bull" : "text-bear"}>{trade.side === "long" ? "Long" : "Short"}</span>
        <span className="text-ink-muted">at {usdFromE8(trade.entryPriceE8)}</span>
      </h1>
      <p className="m-0 text-ink-muted">
        {trade.request.trade.sizePct}% of book · stop {trade.request.trade.stopLossPct}% · target {trade.request.trade.takeProfitPct}% · decided {utcDate(trade.submittedAt)}, {utcClock(trade.submittedAt)} UTC
      </p>
    </div>
  );
}

function WhyPanel({ trade }: { trade: Trade }) {
  return (
    <Panel label="Why the agent traded">
      <PanelHeader title="Why the agent traded" />
      <p className="m-0 px-6 pb-4 text-ink">{trade.explanation}</p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[14px]">
          <thead><tr className="text-left text-[12.5px] text-ink-faint">
            {["Source", "Trust", "Sentiment", "Conviction"].map((h, i) => <th key={h} className={`border-y border-line px-4 py-2.5 font-medium first:pl-6 ${i ? "text-right" : ""} last:pr-6`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {trade.kols.map((k) => (
              <tr key={k.handle} className="border-b border-line last:border-0">
                <th scope="row" className="py-3 pl-6 text-left font-semibold">@{k.handle}</th>
                <td className="px-4 text-right">{k.trustWeight}</td>
                <td className="px-4 text-right">{signed(k.sentiment)}</td>
                <td className="px-4 pr-6 text-right">{k.conviction.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CitedPosts({ trade }: { trade: Trade }) {
  const posts = trade.posts ?? [];
  return (
    <Panel label="Cited posts">
      <PanelHeader title="Cited posts" meta="re-fetched inside the Chainlink CRE enclave when stamped" />
      {posts.map((post) => {
        const at = Date.parse(post.createdAt);
        return (
          <article key={post.id} className="border-t border-line px-6 py-4">
            <div className="flex flex-wrap justify-between gap-2 text-[13px]">
              <b className="font-semibold">@{post.author}</b>
              <span className="text-ink-muted">{utcDate(at)}, {utcClock(at)} UTC</span>
            </div>
            <p className="my-1.5 max-w-[70ch]">{post.text}</p>
            <a href={postUrl(post.author, post.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px]">View on X <ExternalIcon size={12} /></a>
          </article>
        );
      })}
    </Panel>
  );
}

function RecordPanel({ trade }: { trade: Trade }) {
  const rows: [string, React.ReactNode][] = [
    ["Bundle hash", trade.bundleHash ? <Hash value={trade.bundleHash} full /> : "not stamped yet"],
    ["Ruleset", <Link to={`/rulesets#${trade.rulesetHash}`} className="font-mono text-[12.5px]">{trade.rulesetHash.slice(0, 10)}…</Link>],
    ["Extractions hash", <Hash value={trade.request.extractionsHash} />],
    ["Entry price", trade.entryPriceE8 ? `${usdFromE8(trade.entryPriceE8)} · median of the oracle network` : "not filled"],
    ["Evidence flags", trade.flags.length ? trade.flags.join(", ") : "none"],
    ["Transaction", isRealTx(trade.txHash) ? <a href={txUrl(trade.txHash)} target="_blank" rel="noreferrer" className="font-mono text-[12.5px]">{trade.txHash.slice(0, 10)}… ↗</a> : trade.isDemo ? "demo data, no transaction" : "pending"],
  ];
  return (
    <Panel label="On-chain record" className="px-6 py-5">
      <h2 className="m-0 mb-3 text-base font-semibold">On-chain record</h2>
      <dl className="m-0 grid gap-3.5 text-[14px]">
        {rows.map(([k, v]) => <div key={k}><dt className="text-[13px] text-ink-muted">{k}</dt><dd className="m-0 mt-0.5 min-w-0">{v}</dd></div>)}
      </dl>
    </Panel>
  );
}

export function TradePage() {
  const id = Number(useParams().id);
  const trade = useTrade(id);
  if (!Number.isInteger(id) || id < 1) return <Panel><Failure what="this trade" error={new Error("invalid trade ID")} /></Panel>;
  if (trade.isPending) return <Panel><Loading label="trade" /></Panel>;
  if (trade.isError) return <Panel><Failure what="this trade" error={trade.error} /></Panel>;
  return (
    <>
      <Header trade={trade.data} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ReplayPanel tradeId={id} />
          <WhyPanel trade={trade.data} />
          <CitedPosts trade={trade.data} />
        </div>
        <RecordPanel trade={trade.data} />
      </div>
    </>
  );
}
