import { CheckIcon, CrossIcon, InfoIcon } from "../../components/icons";
import { Failure, Loading, Panel } from "../../components/ui";
import { useReplay } from "../../lib/api";
import type { ReplayCheck } from "../../lib/types";

const CHECK_TITLES: Record<ReplayCheck["name"], string> = {
  ruleset: "Rules committed before the trade",
  signal: "Signal reproduces from saved posts",
  request: "Stamp request rebuilds identically",
  bundle: "Bundle hash matches the ledger",
};

const VERDICT = {
  match: { title: "Replay matches the on-chain record", body: "Anyone can re-derive this trade from its saved inputs and get the same stamp.", tone: "border-action bg-action/15 text-proof" },
  mismatch: { title: "Replay does not match", body: "At least one check failed. The stored inputs no longer reproduce what was stamped.", tone: "border-bear/60 bg-bear/10 text-bear-ink" },
  pending: { title: "Waiting for the on-chain stamp", body: "The decision replays; the bundle check completes once Chainlink CRE stamps it.", tone: "border-line-strong bg-raised text-ink" },
} as const;

function CheckRow({ check }: { check: ReplayCheck }) {
  const icon = check.status === "pass" ? <CheckIcon size={14} /> : check.status === "fail" ? <CrossIcon size={14} /> : <InfoIcon size={14} />;
  const tone = check.status === "pass" ? "bg-action/25 text-proof" : check.status === "fail" ? "bg-bear/15 text-bear" : "bg-raised text-ink-muted";
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3 border-t border-line py-3.5 first:border-0">
      <span className={`grid size-7 place-items-center rounded-md ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <b className="block font-semibold">{CHECK_TITLES[check.name]}</b>
        <span className="block break-words text-[13.5px] text-ink-muted">{check.detail}</span>
      </div>
    </li>
  );
}

export function ReplayPanel({ tradeId }: { tradeId: number }) {
  const replay = useReplay(tradeId);
  if (replay.isPending) return <Panel><Loading label="replay" /></Panel>;
  if (replay.isError) return <Panel><Failure what="the replay" error={replay.error} /></Panel>;
  const verdict = VERDICT[replay.data.verdict];
  return (
    <Panel label="Replay" className="overflow-hidden">
      <div className={`flex items-start gap-3 border-b px-6 py-5 ${verdict.tone}`}>
        {replay.data.verdict === "mismatch" ? <CrossIcon size={20} /> : <CheckIcon size={20} />}
        <div>
          <h2 className="m-0 text-lg font-semibold">{verdict.title}</h2>
          <p className="m-0 text-[13.5px] text-ink-muted">{verdict.body}</p>
        </div>
      </div>
      <ol className="m-0 list-none px-6 py-1">
        {replay.data.checks.map((c) => <CheckRow key={c.name} check={c} />)}
      </ol>
    </Panel>
  );
}
