import { Link, useParams } from "react-router";
import { Failure, Loading } from "../../components/ui";
import { useTrade } from "../../lib/api";
import { signed, tradeCode, usdFromE8, utcClock, utcDate } from "../../lib/format";
import { isRealTx, postUrl, txUrl } from "../../lib/links";
import type { Trade } from "../../lib/types";
import { ReplayPanel } from "./ReplayPanel";
import { positionLabel } from "./TradesTable";

function Position({ trade: t }: { trade: Trade }) {
  return <section><h2 className="section-title">Paper position</h2><dl className="definition-list">
    <div><dt>Position</dt><dd>{positionLabel(t)}</dd></div>
    <div><dt>Entry price</dt><dd>{usdFromE8(t.entryPriceE8)}</dd></div>
    <div><dt>Size</dt><dd>{t.request.trade.sizePct}% of book</dd></div>
    <div><dt>Stop loss / take profit</dt><dd>{t.request.trade.stopLossPct}% / {t.request.trade.takeProfitPct}%</dd></div>
    {t.closedAt !== null && <>
      <div><dt>Exit price</dt><dd>{usdFromE8(t.exitPriceE8)}</dd></div>
      <div><dt>Closed</dt><dd>{utcDate(t.closedAt)}, {utcClock(t.closedAt)} UTC</dd></div>
      <div><dt>Realized P&L on position</dt><dd>{t.pnl ? `${signed(t.pnl.returnPct)}%` : "Unavailable"}</dd></div>
      {t.pnl && <div><dt>Book contribution</dt><dd>{signed(t.pnl.bookContributionPct)} percentage points</dd></div>}
      {t.exitPriceAt !== null && <div><dt>Exit price observed</dt><dd>{utcDate(t.exitPriceAt)}, {utcClock(t.exitPriceAt)} UTC</dd></div>}
    </>}
  </dl><p className="quiet-note">{t.closedAt === null ? "Open positions have no realized P&L. " : ""}Paper exits are recorded off-chain using observed CoinGecko prices. P&L excludes fees and funding. Prices may pass a stop or target between checks.</p></section>;
}
export function TradePage() {
  const id = Number(useParams().id);
  const query = useTrade(id);
  if (!Number.isInteger(id) || id < 1) return <Failure what="this trade" error={new Error("Invalid trade ID")} />;
  if (query.isPending) return <Loading label="trade" />;
  if (query.isError) return <Failure what="this trade" error={query.error} />;
  const t = query.data;
  return <>
    <header className="page-header"><Link to="/trades" className="back-link">← All trades</Link><h1>{t.token} · {t.side === "long" ? "Long" : "Short"}</h1><p>{tradeCode(t.id)} · {utcDate(t.submittedAt)}, {utcClock(t.submittedAt)} UTC{t.isDemo ? " · Demo trade" : " · Live paper trade"}</p></header>
    {t.isDemo && <p className="notice">This is seeded demo data. It illustrates the evidence flow and is not a live agent execution.</p>}
    <div className="trade-layout"><div className="page-stack">
      <section><h2 className="section-title">Why the agent traded</h2><p className="text-xl leading-relaxed">{t.kols.length} sources agreed on a {t.side === "long" ? "bullish" : "bearish"} direction for {t.token}, meeting the trading rules for agreement and conviction.</p><Link to={`/rulesets#${t.rulesetHash}`}>Rules used for this trade →</Link></section>
      <section><h2 className="section-title">Cited posts</h2><p className="quiet-note">These posts were cited in the entry decision. Verification findings below show what can be reproduced.</p>
        {!t.posts?.length && <p className="empty-state">No cited posts are available for this trade.</p>}
        <div className="post-list">{t.posts?.map(p => <article key={p.id}><div className="flex flex-wrap justify-between gap-2"><b>@{p.author}</b><span className="quiet-note">{utcDate(Date.parse(p.createdAt))}</span></div><p>{p.text}</p><a href={postUrl(p.author,p.id)} target="_blank" rel="noreferrer">View post on X ↗</a></article>)}</div>
      </section>
      <ReplayPanel tradeId={id} />
    </div><aside className="page-stack"><Position trade={t} /><section><h2 className="section-title">Entry record</h2><p>{t.status === "stamped" ? t.isDemo ? "Demo entry stamp" : "Entry evidence stamped on Sepolia" : t.status === "submitted" ? "Awaiting entry stamp" : "Entry was not stamped"}</p>{isRealTx(t.txHash) && <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer">View transaction on Sepolia ↗</a>}<p className="quiet-note">An entry stamp and a replay verdict describe different checks. Neither verifies an off-chain exit.</p></section></aside></div>
    <details className="technical-details"><summary>Technical record and saved inputs</summary><dl className="definition-list"><div><dt>Ruleset hash</dt><dd className="font-mono break-all">{t.rulesetHash}</dd></div><div><dt>Bundle hash</dt><dd className="font-mono break-all">{t.bundleHash ?? "Not recorded"}</dd></div><div><dt>Open tokens at decision</dt><dd>{t.openTokens === null ? "Not saved for this historical trade" : t.openTokens.join(", ") || "None"}</dd></div><div><dt>Flags</dt><dd>{t.flags.join(", ") || "None recorded"}</dd></div>{t.failureReason && <div><dt>Submission failure</dt><dd>{t.failureReason === "stamp-timeout" ? "No matching stamp found within 30 minutes" : t.failureReason === "submission-failed" ? "Bridge submission failed" : t.failureReason}</dd></div>}</dl><h3>Saved decision explanation</h3><p>{t.explanation}</p><h3>Source analysis</h3><pre>{JSON.stringify(t.kols,null,2)}</pre><h3>Saved request</h3><pre>{JSON.stringify(t.request,null,2)}</pre></details>
  </>;
}
