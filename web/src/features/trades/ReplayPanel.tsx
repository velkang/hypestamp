import { EvidenceStatus } from "../../components/EvidenceStatus";
import { Failure, Loading } from "../../components/ui";
import { useReplay } from "../../lib/api";

const descriptions = {
  match: "The saved inputs reproduce the recorded entry evidence. This does not verify the trade's profit or loss.",
  mismatch: "At least one check failed. The saved inputs do not reproduce the recorded evidence.",
  pending: "Some evidence could not be checked. A missing stamp or historical input is not a confirmed mismatch.",
};
export function ReplayPanel({ tradeId }: { tradeId: number }) {
  const replay = useReplay(tradeId);
  if (replay.isPending) return <Loading label="evidence checks" />;
  if (replay.isError) return <Failure what="evidence checks" error={replay.error} />;
  return <section aria-labelledby="verification-title">
    <h2 id="verification-title" className="section-title">Evidence verification</h2>
    <EvidenceStatus verdict={replay.data.verdict} />
    <p className="text-ink-muted">{descriptions[replay.data.verdict]}</p>
    <details className="technical-details"><summary>View detailed checks</summary><dl className="definition-list">
      {replay.data.checks.map(c => <div key={c.name}><dt>{c.name} · {c.status === "pass" ? "Matched" : c.status === "fail" ? "Mismatch" : "Incomplete"}</dt><dd>{c.detail}</dd></div>)}
    </dl></details>
  </section>;
}
