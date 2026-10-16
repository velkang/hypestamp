import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { Badge, Panel } from "../../components/ui";
import { useNow } from "../../lib/hooks";
import { isRealTx, txUrl } from "../../lib/links";
import type { CommitResult } from "../../lib/types";
import { adminPost, useAdminOverview, useAdminSession } from "../admin/session";
import type { Draft } from "./diff";

function Progress({ result }: { result: CommitResult }) {
  const overview = useAdminOverview(15_000);
  const now = useNow();
  const row = overview.data?.rulesets.find((r) => r.hash === result.hash);
  const status = row?.status ?? "pending";
  const secondsLeft = Math.max(0, Math.round(result.effectiveFrom - now / 1000));
  return (
    <div className="flex flex-col gap-2 text-[14px]" aria-live="polite">
      <span><Badge tone="ok" icon="check">Submitted to Chainlink CRE</Badge></span>
      {status === "pending" && <span className="text-ink-muted">Waiting for the RulesetCommitted event on Sepolia. The agent checks every few minutes.</span>}
      {status === "failed" && <span className="text-bear-ink">The commit never reached the ledger. Check the CRE bridge, then commit again.</span>}
      {status === "confirmed" && (
        <>
          <span><Badge tone="proof" icon="check">Recorded on-chain</Badge> {isRealTx(row?.commitTx ?? null) && <a href={txUrl(row!.commitTx!)} target="_blank" rel="noreferrer" className="font-mono text-[12.5px]">tx ↗</a>}</span>
          <span>{secondsLeft > 0 ? `In cooldown: takes effect in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "In force now."}</span>
        </>
      )}
      <Link to="/admin">Back to the console</Link>
    </div>
  );
}

export function CommitPanel({ draft, valid }: { draft: Draft; valid: boolean }) {
  const { token } = useAdminSession();
  const commit = useMutation({ mutationFn: () => adminPost<CommitResult>(token, "/rulesets", draft) });
  return (
    <Panel label="Commit" className="flex flex-col gap-3 p-6">
      <h2 className="m-0 text-base font-semibold">Commit on-chain</h2>
      <p className="m-0 text-[13.5px] text-ink-muted">Sends a Sepolia transaction through Chainlink CRE. Once recorded, the rules can't be changed, only replaced by a newer ruleset after its own cooldown.</p>
      {commit.isSuccess ? <Progress result={commit.data} /> : (
        <>
          {commit.isError && <p role="alert" className="m-0 text-[13.5px] text-bear-ink">{commit.error instanceof Error ? commit.error.message : "Commit failed."}</p>}
          <button type="button" disabled={!valid || commit.isPending} onClick={() => commit.mutate()}
            className="h-11 rounded-[9px] bg-action font-semibold text-white hover:bg-action-hover disabled:opacity-40">
            {commit.isPending ? "Committing…" : "Commit ruleset"}
          </button>
        </>
      )}
    </Panel>
  );
}
