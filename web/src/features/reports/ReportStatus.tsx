import { EvidenceStatus } from "../../components/EvidenceStatus";
import type { ReportSummary } from "../../lib/types";

export function reportVerdict(summary: ReportSummary["summary"]) {
  return summary.replay.mismatch > 0 ? "mismatch" : summary.replay.pending > 0 ? "pending" : "match";
}
export function ReportReviewStatus({ summary }: { summary: ReportSummary["summary"] }) {
  if (summary.total === 0) return <span className="quiet-note">No trades in period</span>;
  return <EvidenceStatus verdict={reportVerdict(summary)} />;
}
