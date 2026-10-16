import { useQuery } from "@tanstack/react-query";
import { Hash, Panel } from "../../components/ui";
import { useDebounced } from "../../lib/hooks";
import type { Ruleset, RulesetPreview } from "../../lib/types";
import { adminPost, useAdminSession } from "../admin/session";
import { diffRulesets, type Draft } from "./diff";

export function usePreview(draft: Draft) {
  const debounced = useDebounced(draft, 400);
  const { token } = useAdminSession();
  return useQuery({
    queryKey: ["preview", JSON.stringify(debounced)],
    queryFn: () => adminPost<RulesetPreview>(token, "/rulesets/preview", debounced),
    retry: false,
  });
}

export type Preview = ReturnType<typeof usePreview>;

export function PreviewPanel({ draft, active, preview }: { draft: Draft; active: Ruleset | undefined; preview: Preview }) {
  const changes = diffRulesets(active, draft);
  const { converge: c, risk: r } = draft;
  return (
    <Panel label="Preview" className="flex flex-col gap-4 p-6">
      <h2 className="m-0 text-base font-semibold">What you would commit</h2>
      {preview.isError ? (
        <div role="alert" className="rounded-lg border border-bear/50 bg-bear/10 p-3 text-[13.5px] text-bear-ink">
          <b className="block">Not valid yet</b>
          {preview.error instanceof Error ? preview.error.message : "Check the fields."}
        </div>
      ) : (
        <dl className="m-0 grid gap-3 text-[14px]">
          <div><dt className="text-[13px] text-ink-muted">Ruleset ID if committed now</dt><dd className="m-0">{preview.data ? <Hash value={preview.data.hash} /> : "computing…"}</dd></div>
          <div><dt className="text-[13px] text-ink-muted">Takes effect</dt><dd className="m-0">{preview.data ? `about ${Math.ceil((preview.data.cooldown + 60) / 60)} min after commit, once the ${preview.data.cooldown} s cooldown has passed` : "…"}</dd></div>
        </dl>
      )}
      <p className="m-0 text-[14px]">
        Trade when at least <b>{c.minKols}</b> of <b>{draft.sources.length}</b> sources agree within <b>{c.windowHours} h</b> (conviction ≥ {c.minConviction}, combined trust ≥ {c.minTrustSum}). Risk up to <b>{r.maxPositionPct}%</b> per trade, stop {r.stopLossPct}%, target {r.takeProfitPct}%, at most {r.maxOpen} open.
      </p>
      <div>
        <h3 className="m-0 mb-1.5 text-[13px] font-medium text-ink-muted">Changes from the ruleset in force</h3>
        {changes.length === 0 ? <p className="m-0 text-[14px] text-ink-muted">No changes yet.</p> : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[12.5px]">{changes.map((line) => <li key={line}>{line}</li>)}</ul>
        )}
      </div>
    </Panel>
  );
}
