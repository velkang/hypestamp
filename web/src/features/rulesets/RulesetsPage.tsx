import { Link, useLocation } from "react-router";
import { Badge, Empty, Failure, Hash, Loading, PageHeader, Panel, PanelHeader } from "../../components/ui";
import { useRuleset, useRulesets } from "../../lib/api";
import { canonicalJson } from "../../lib/canonical";
import { shortHash, utcClockSeconds, utcDate } from "../../lib/format";
import type { RulesetDetail, RulesetSummary } from "../../lib/types";

function Timeline({ rulesets, selected }: { rulesets: RulesetSummary[]; selected: string }) {
  const now = Date.now();
  const inForce = rulesets.findIndex((x) => x.status === "confirmed" && x.effectiveFrom * 1000 <= now);
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {rulesets.map((r, i) => {
        const effective = r.effectiveFrom * 1000;
        const state = r.status === "pending" ? "Awaiting chain" : r.status === "failed" ? "Not committed"
          : effective > now ? "In cooldown" : i === inForce ? "In force" : "Superseded";
        const tone = state === "In force" ? "ok" : state === "Not committed" ? "bad" : state === "Superseded" ? "quiet" : "flag";
        return (
          <li key={r.hash}>
            <Link to={`/rulesets#${r.hash}`} aria-current={r.hash === selected ? "true" : undefined}
              className={`block rounded-[12px] border px-4 py-3.5 text-ink hover:no-underline ${r.hash === selected ? "border-action bg-raised" : "border-line bg-panel hover:border-line-strong"}`}>
              <span className="flex items-center gap-2"><Badge tone={tone}>{state}</Badge><span className="font-mono text-[12.5px]">{shortHash(r.hash)}</span></span>
              <span className="mt-2 block text-[13.5px]">Committed {utcClockSeconds(r.committedAt)} → effective {utcClockSeconds(effective)} UTC</span>
              <span className="block text-[13px] text-ink-muted">{utcDate(effective)} · {r.sources} sources · {r.model}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="m-0 mb-1.5 text-[13px] font-medium text-ink-muted">{title}</h3>
      <div className="text-[14px]">{children}</div>
    </div>
  );
}

function Detail({ detail }: { detail: RulesetDetail }) {
  const { ruleset: r } = detail;
  return (
    <Panel label="Selected ruleset">
      <PanelHeader title={<span className="font-mono text-[15px]">{shortHash(detail.hash)}</span>}>
        {detail.verified ? <Badge tone="proof" icon="check">JSON hashes to its on-chain ID</Badge> : <Badge tone="bad" icon="cross">Hash mismatch</Badge>}
      </PanelHeader>
      <div className="grid gap-6 border-t border-line px-6 py-5 md:grid-cols-2">
        <Rule title="Signal rule">
          At least <b>{r.converge.minKols} sources</b> agree on a token and direction within <b>{r.converge.windowHours} h</b>, each with conviction ≥ <b>{r.converge.minConviction}</b>, and their trust adds up to ≥ <b>{r.converge.minTrustSum}</b>. If both directions qualify, no trade.
        </Rule>
        <Rule title="Risk limits">
          Up to <b>{r.risk.maxPositionPct}%</b> of the book per trade, scaled by conviction · stop <b>{r.risk.stopLossPct}%</b> · target <b>{r.risk.takeProfitPct}%</b> · at most <b>{r.risk.maxOpen}</b> open.
        </Rule>
        <Rule title="Extraction">
          {r.extraction.model}, prompt pinned as <Hash value={r.extraction.promptHash} />. The agent refuses to run any other prompt under this ruleset.
        </Rule>
        <Rule title="Evidence flags">
          Burst: {r.flags.burstMinKols} sources within {r.flags.burstMinutes} min · paid markers: {r.flags.promoKeywords.join(", ") || "none"}.
        </Rule>
        <Rule title="Sources and trust">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {r.sources.map((s) => (
              <li key={s.handle} className="flex justify-between gap-4"><span>@{s.handle}</span><span className="font-mono text-[12.5px]">{s.trustWeight}</span></li>
            ))}
          </ul>
        </Rule>
        <Rule title="Commitment">
          Effective {utcDate(r.effectiveFrom * 1000)}, {utcClockSeconds(r.effectiveFrom * 1000)} UTC. The ledger refuses any trade stamped under it before then.
        </Rule>
      </div>
      <div className="border-t border-line px-6 py-5">
        <h3 className="m-0 mb-2 text-[13px] font-medium text-ink-muted">Committed JSON</h3>
        <pre className="m-0 max-h-[320px] overflow-auto rounded-lg bg-page p-4 font-mono text-[12.5px] leading-relaxed text-ink-muted">{JSON.stringify(JSON.parse(canonicalJson(r)), null, 2)}</pre>
      </div>
    </Panel>
  );
}

export function RulesetsPage() {
  const rulesets = useRulesets();
  const hash = useLocation().hash.slice(1);
  const selected = rulesets.data?.some((r) => r.hash === hash) ? hash : rulesets.data?.[0]?.hash;
  const detail = useRuleset(selected);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Pre-committed rules">
          Like a Rule 10b5-1 trading plan, every ruleset is published on-chain before it takes effect and must wait out a cooldown. The ledger refuses any trade not made under the ruleset in force.
        </PageHeader>
        <Link to="/rulesets/new" className="inline-flex h-10 items-center rounded-[9px] bg-action px-4 font-semibold text-white hover:bg-action-hover hover:no-underline">Compose new ruleset</Link>
      </div>
      {rulesets.isPending && <Panel><Loading label="rulesets" /></Panel>}
      {rulesets.isError && <Panel><Failure what="rulesets" error={rulesets.error} /></Panel>}
      {rulesets.data?.length === 0 && <Panel><Empty title="No rulesets yet">Commit a ruleset to start the agent; it takes effect after the cooldown.</Empty></Panel>}
      {rulesets.data && selected && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Timeline rulesets={rulesets.data} selected={selected} />
          {detail.isPending ? <Panel><Loading label="ruleset" /></Panel>
            : detail.isError ? <Panel><Failure what="this ruleset" error={detail.error} /></Panel>
            : <Detail detail={detail.data} />}
        </div>
      )}
    </>
  );
}
