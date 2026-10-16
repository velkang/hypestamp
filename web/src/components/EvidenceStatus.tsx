import type { Replay } from "../lib/types";

const LABEL = { match: "Matched", mismatch: "Mismatch", pending: "Incomplete" };
export function EvidenceStatus({ verdict }: { verdict: Replay["verdict"] | undefined }) {
  return <span className={`evidence-status status-${verdict ?? "pending"}`}>{verdict ? LABEL[verdict] : "Not checked"}</span>;
}
