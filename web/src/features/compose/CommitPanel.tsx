import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Panel } from "../../components/ui";
import { postJson, useRulesets } from "../../lib/api";
import { useNow } from "../../lib/hooks";
import { isRealTx, txUrl } from "../../lib/links";
import type { CommitResult } from "../../lib/types";
import type { Draft } from "./diff";

const TOKEN_KEY = "hypestamp.ownerToken";
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const saveToken = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private mode: keep in memory only */ } };

function Progress({ result }: { result: CommitResult }) {
  const rulesets = useRulesets(15_000);
  const now = useNow();
  const row = rulesets.data?.find((r) => r.hash === result.hash);
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
      <Link to={`/rulesets#${result.hash}`}>View on the rulesets page</Link>
    </div>
  );
}

export function CommitPanel({ draft, valid }: { draft: Draft; valid: boolean }) {
  const [token, setToken] = useState(readToken);
  const commit = useMutation({
    mutationFn: () => postJson<CommitResult>("/v1/rulesets", draft, { Authorization: `Bearer ${token}` }),
    onSuccess: () => saveToken(token),
  });
  return (
    <Panel label="Commit" className="flex flex-col gap-3 p-6">
      <h2 className="m-0 text-base font-semibold">Commit on-chain</h2>
      <p className="m-0 text-[13.5px] text-ink-muted">Only the owner can commit: each commit is a Sepolia transaction sent through Chainlink CRE. Once committed, the rules can't be changed, only replaced by a newer ruleset after its own cooldown.</p>
      {commit.isSuccess ? <Progress result={commit.data} /> : (
        <>
          <label htmlFor="owner-token" className="text-[13px] font-medium text-ink-muted">Owner token</label>
          <input id="owner-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
            className="h-10 rounded-[9px] border border-line-strong bg-page px-3 text-ink outline-none focus:border-proof" />
          {commit.isError && <p role="alert" className="m-0 text-[13.5px] text-bear-ink">{commit.error instanceof Error ? commit.error.message : "Commit failed."}</p>}
          <button type="button" disabled={!valid || !token || commit.isPending} onClick={() => commit.mutate()}
            className="h-11 rounded-[9px] bg-action font-semibold text-white hover:bg-action-hover disabled:opacity-40">
            {commit.isPending ? "Committing…" : "Commit ruleset"}
          </button>
        </>
      )}
    </Panel>
  );
}
