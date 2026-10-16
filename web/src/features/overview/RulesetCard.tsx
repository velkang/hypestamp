import { Link } from "react-router";
import { CheckIcon, CrossIcon } from "../../components/icons";
import { Panel } from "../../components/ui";
import { useRuleset, useRulesets, useStatus, useTrades } from "../../lib/api";
import { shortHash, tradeCode, utcClock, utcClockSeconds } from "../../lib/format";
import { buildTrack, type Stop } from "./track";

const MARKER: Record<Stop["kind"], string> = {
  committed: "border-action bg-page",
  refused: "border-bear bg-page text-bear",
  effective: "border-action bg-action",
  trade: "border-action bg-page text-proof",
  now: "border-bull bg-page",
};

function stopLabel(stop: Stop): [string, string] {
  switch (stop.kind) {
    case "committed": return [utcClockSeconds(stop.at), "committed"];
    case "refused": return [utcClockSeconds(stop.at), `${tradeCode(stop.tradeId!)} not stamped`];
    case "effective": return [utcClockSeconds(stop.at), "in force"];
    case "trade": return [utcClock(stop.at), tradeCode(stop.tradeId!)];
    case "now": return [utcClock(stop.at), "now · unchanged"];
  }
}

function StopMark({ stop }: { stop: Stop }) {
  const [time, label] = stopLabel(stop);
  const failed = stop.kind === "refused" || stop.status === "failed";
  const caption = stop.status === "failed" && stop.kind === "trade" ? `${label} not stamped` : label;
  const align = stop.position === 0 ? "items-start" : stop.position === 100 ? "items-end -translate-x-full" : "items-center -translate-x-1/2";
  const body = (
    <>
      <i className={`grid size-5 place-items-center rounded-full border-2 ${failed ? MARKER.refused : MARKER[stop.kind]}`}>
        {failed && <CrossIcon size={10} />}
        {stop.kind === "trade" && !failed && <CheckIcon size={10} />}
      </i>
      <b className="font-semibold">{time}</b>
      <span className="text-ink-muted">{caption}</span>
    </>
  );
  const className = `absolute top-0 flex flex-col gap-1 whitespace-nowrap text-[12.5px] leading-tight ${align}`;
  return stop.tradeId !== undefined ? (
    <Link to={`/trades/${stop.tradeId}`} className={`${className} text-ink hover:no-underline`} style={{ left: `${stop.position}%` }}>{body}</Link>
  ) : (
    <div className={className} style={{ left: `${stop.position}%` }}>{body}</div>
  );
}

// The cooldown segment is dashed (rules committed, not yet usable); trading is solid.
function Segment({ stops, dashed = false }: { stops: Stop[]; dashed?: boolean }) {
  return (
    <div className="relative h-[74px]">
      <div className={`absolute inset-x-0 top-[9px] border-t-2 border-action ${dashed ? "border-dashed" : ""}`} />
      {stops.map((stop) => <StopMark key={`${stop.kind}-${stop.at}`} stop={stop} />)}
    </div>
  );
}

export function RulesetCard() {
  const status = useStatus();
  const rulesets = useRulesets();
  const trades = useTrades();
  const active = status.data?.activeRuleset;
  const detail = useRuleset(active?.hash);
  const committedAt = rulesets.data?.find((r) => r.hash === active?.hash)?.committedAt;

  if (!active || committedAt === undefined) {
    return <Panel className="p-6"><p className="m-0 text-ink-muted">No ruleset is in force yet. The agent will not trade until one is committed and its cooldown has passed.</p></Panel>;
  }
  const track = buildTrack({ committedAt, effectiveFrom: active.effectiveFrom, trades: (trades.data ?? []).filter((t) => t.rulesetHash === active.hash), now: Date.now() });
  const firstRefusal = track.before.find((s) => s.kind === "refused");
  const r = detail.data?.ruleset;

  return (
    <Panel label="Ruleset in force" className="px-6 pt-6 pb-5">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[5px] bg-bull/10 px-2 text-xs font-semibold text-bull"><span className="size-[7px] rounded-full bg-bull" />In force</span>
        <span>Ruleset</span>
        <Link to={`/rulesets#${active.hash}`} className="font-mono">{shortHash(active.hash)}</Link>
        <Link to="/rulesets" className="ml-auto inline-flex h-[34px] items-center rounded-[9px] border border-line-strong px-3.5 font-semibold text-ink hover:no-underline hover:bg-raised">View rules</Link>
      </div>
      <h1 className="mt-3.5 mb-1 text-[26px] font-bold tracking-[-0.02em]">Rules were locked on-chain before any trade</h1>
      <p className="m-0 max-w-[70ch] text-ink-muted">
        Committed, held through the cooldown, then used.{firstRefusal ? " An earlier submission was not stamped." : ""}
      </p>
      <div className="relative mt-6 mb-2 overflow-x-auto">
        <div className="grid min-w-[620px] grid-cols-[44fr_18px_56fr] items-start px-1">
          <Segment stops={track.before} dashed />
          <div className="grid h-5 place-items-center text-ink-faint" aria-hidden="true">≈</div>
          <Segment stops={track.after} />
        </div>
      </div>
      {r && (
        <dl className="m-0 mt-1.5 flex flex-wrap gap-y-2 border-t border-line pt-3.5 text-[13.5px]">
          {[
            ["Sources", `${r.sources.length} trusted`],
            ["Signal", `${r.converge.minKols} agree within ${r.converge.windowHours} h`],
            ["Position", `≤ ${r.risk.maxPositionPct}% of book · stop ${r.risk.stopLossPct}%`],
            ["Model", r.extraction.model],
          ].map(([k, v], i) => (
            <div key={k} className={`flex gap-1.5 pr-4.5 ${i ? "sm:border-l sm:border-line sm:pl-4.5" : ""}`}>
              <dt className="text-ink-muted">{k}</dt><dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}
