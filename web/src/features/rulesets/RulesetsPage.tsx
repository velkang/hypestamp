import { Link, useLocation } from "react-router";
import { Empty, Failure, Loading, PageHeader } from "../../components/ui";
import { useRuleset, useRulesets } from "../../lib/api";
import { utcClock, utcDate } from "../../lib/format";
import type { RulesetDetail } from "../../lib/types";

function Detail({ detail }: { detail: RulesetDetail }) {
  const r = detail.ruleset;
  return <section><h2 className="section-title">Trading conditions</h2><dl className="definition-list">
    <div><dt>Agreement</dt><dd>At least {r.converge.minKols} sources agree on a token and direction within {r.converge.windowHours} hours. If both directions qualify, the agent does not trade.</dd></div>
    <div><dt>Conviction</dt><dd>Each source must have conviction of at least {r.converge.minConviction}. Their combined trust weight must reach {r.converge.minTrustSum}.</dd></div>
    <div><dt>Position limits</dt><dd>Up to {r.risk.maxPositionPct}% of the book per trade, scaled by conviction. At most {r.risk.maxOpen} open positions.</dd></div>
    <div><dt>Exits</dt><dd>{r.risk.stopLossPct}% stop loss and {r.risk.takeProfitPct}% take profit. Paper exits are observed and recorded off-chain.</dd></div>
    <div><dt>Accounts followed</dt><dd>{r.sources.map(s => `@${s.handle}`).join(", ")}</dd></div>
    <div><dt>Effective from</dt><dd>{utcDate(r.effectiveFrom * 1000)}, {utcClock(r.effectiveFrom * 1000)} UTC</dd></div>
  </dl><details className="technical-details"><summary>Commitment, analysis settings, and JSON</summary><p>{detail.verified ? "The rules JSON matches its recorded hash." : "The rules JSON does not match its recorded hash."}</p><p className="font-mono break-all">{detail.hash}</p><p>Analysis model: {r.extraction.model}. Source weights, promotion markers, and the pinned analysis prompt are included below.</p><pre>{JSON.stringify(r,null,2)}</pre></details></section>;
}
export function RulesetsPage() {
  const rulesets = useRulesets();
  const hash = useLocation().hash.slice(1);
  const selected = rulesets.data?.some(r => r.hash === hash) ? hash : rulesets.data?.find(r => r.effectiveFrom * 1000 <= Date.now())?.hash ?? rulesets.data?.[0]?.hash;
  const detail = useRuleset(selected);
  return <><PageHeader title="Trading rules">Published before they take effect, so each trade can be checked against the conditions set in advance.</PageHeader>
    <p className="max-w-[75ch] text-ink-muted">The Sepolia ledger records each ruleset before a cooldown. Entry evidence must refer to the rules in force. These are practice trades with no real funds.</p>
    {rulesets.isPending ? <Loading label="trading rules" /> : rulesets.isError ? <Failure what="trading rules" error={rulesets.error} /> : !selected ? <Empty title="No published rules yet">Trading conditions will appear here once recorded on-chain.</Empty> : <>
      {detail.isPending ? <Loading label="selected rules" /> : detail.isError ? <Failure what="the selected rules" error={detail.error} /> : <Detail detail={detail.data} />}
      <details className="technical-details"><summary>Published rule history</summary><ul className="m-0 list-none p-0">{rulesets.data?.map((r,i) => <li key={r.hash} className="py-3"><Link to={`/rulesets#${r.hash}`} aria-current={selected === r.hash ? "true" : undefined}>Rules published {utcDate(r.committedAt)}, {utcClock(r.committedAt)} UTC</Link><span className="ml-3 text-ink-muted">{r.effectiveFrom * 1000 > Date.now() ? "In cooldown" : r.hash === rulesets.data?.find(x => x.effectiveFrom * 1000 <= Date.now())?.hash ? "In force" : `Earlier rules ${rulesets.data!.length - i}`}</span></li>)}</ul></details>
    </>}
  </>;
}
