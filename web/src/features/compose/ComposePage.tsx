import { useState } from "react";
import { Link } from "react-router";
import { Failure, Loading, PageHeader, Panel } from "../../components/ui";
import { useRuleset, useStatus } from "../../lib/api";
import type { Ruleset } from "../../lib/types";
import { CommitPanel } from "./CommitPanel";
import type { Draft } from "./diff";
import { NumberField, Section, TextField } from "./fields";
import { PreviewPanel, usePreview } from "./PreviewPanel";
import { SourcesEditor } from "./SourcesEditor";

export const DEFAULT_DRAFT: Draft = {
  version: 1,
  sources: [],
  extraction: { model: "gpt-6-luna", schemaVersion: 1 },
  converge: { minKols: 3, windowHours: 6, minConviction: 0.6, minTrustSum: 1.5 },
  risk: { maxPositionPct: 2, stopLossPct: 8, takeProfitPct: 20, maxOpen: 3 },
  flags: { burstMinutes: 10, burstMinKols: 3, promoKeywords: ["#ad", "sponsored", "paid partnership"] },
};

export function draftFrom(active: Ruleset | undefined): Draft {
  if (!active) return DEFAULT_DRAFT;
  const { effectiveFrom: _effectiveFrom, extraction, ...rest } = active;
  return { ...rest, extraction: { model: extraction.model, schemaVersion: extraction.schemaVersion } };
}

function KeywordsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  const update = (next: string) => {
    setText(next);
    onChange(next.split(",").map((k) => k.trim()).filter(Boolean));
  };
  return (
    <div className="sm:col-span-2">
      <TextField label="Paid-promotion markers" value={text} onChange={update} placeholder="#ad, sponsored"
        hint="Comma separated. A post with one of these and no disclosure is flagged." />
    </div>
  );
}

function Editor({ initial, active }: { initial: Draft; active: Ruleset | undefined }) {
  const [draft, setDraft] = useState(initial);
  const preview = usePreview(draft);
  const set = <K extends "converge" | "risk" | "flags">(group: K, key: keyof Draft[K]) => (value: number) =>
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  const { converge: c, risk: r, flags: f } = draft;
  const valid = preview.isSuccess && !preview.isFetching;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel label="Ruleset editor" className="overflow-hidden">
        <Section title="Sources" hint="Up to 20 X accounts the agent reads. Trust is how much each voice counts toward a signal.">
          <SourcesEditor sources={draft.sources} onChange={(sources) => setDraft((d) => ({ ...d, sources }))} />
        </Section>
        <Section title="Signal rule" hint="When enough trusted sources agree on a token and direction, the agent trades.">
          <NumberField label="Sources that must agree" value={c.minKols} onChange={set("converge", "minKols")} min={1} max={20} step={1} />
          <NumberField label="Within" value={c.windowHours} onChange={set("converge", "windowHours")} min={0.5} step={0.5} suffix="h" />
          <NumberField label="Minimum conviction" value={c.minConviction} onChange={set("converge", "minConviction")} min={0} max={1} step={0.05} hint="0 to 1, per post" />
          <NumberField label="Minimum combined trust" value={c.minTrustSum} onChange={set("converge", "minTrustSum")} min={0.05} step={0.05} />
        </Section>
        <Section title="Risk limits" hint="Practice trades only. Position size scales with conviction up to the maximum.">
          <NumberField label="Max position" value={r.maxPositionPct} onChange={set("risk", "maxPositionPct")} min={0.1} max={100} step={0.5} suffix="%" />
          <NumberField label="Stop loss" value={r.stopLossPct} onChange={set("risk", "stopLossPct")} min={0.5} max={100} step={0.5} suffix="%" />
          <NumberField label="Take profit" value={r.takeProfitPct} onChange={set("risk", "takeProfitPct")} min={0.5} step={0.5} suffix="%" />
          <NumberField label="Max open trades" value={r.maxOpen} onChange={set("risk", "maxOpen")} min={1} step={1} />
        </Section>
        <Section title="Evidence flags" hint="Patterns stamped alongside each trade for anyone reviewing it later.">
          <NumberField label="Burst: sources" value={f.burstMinKols} onChange={set("flags", "burstMinKols")} min={2} step={1} />
          <NumberField label="Burst: within" value={f.burstMinutes} onChange={set("flags", "burstMinutes")} min={1} step={1} suffix="min" />
          <KeywordsField value={f.promoKeywords} onChange={(promoKeywords) => setDraft((d) => ({ ...d, flags: { ...d.flags, promoKeywords } }))} />
        </Section>
        <Section title="Extraction" hint="The model that reads each post. Its prompt hash is pinned automatically when you commit.">
          <div className="sm:col-span-2">
            <TextField label="Model" value={draft.extraction.model} onChange={(model) => setDraft((d) => ({ ...d, extraction: { ...d.extraction, model } }))} />
          </div>
        </Section>
      </Panel>
      <div className="flex flex-col gap-5 lg:sticky lg:top-5">
        <PreviewPanel draft={draft} active={active} preview={preview} />
        <CommitPanel draft={draft} valid={valid} />
      </div>
    </div>
  );
}

export function ComposePage() {
  const status = useStatus();
  const activeHash = status.data?.activeRuleset?.hash;
  const active = useRuleset(activeHash);
  const loading = status.isPending || (activeHash !== undefined && active.isPending);

  return (
    <>
      <PageHeader title="Compose a ruleset" back={<Link to="/rulesets" className="text-[13.5px]">← Pre-committed rules</Link>}>
        Starts from the ruleset in force. Anyone can draft and preview; committing needs the owner token, and the new rules only take effect after the on-chain cooldown.
      </PageHeader>
      {loading && <Panel><Loading label="the ruleset in force" /></Panel>}
      {status.isError && <Panel><Failure what="the agent status" error={status.error} /></Panel>}
      {!loading && !status.isError && (
        <Editor key={activeHash ?? "none"} initial={draftFrom(active.data?.ruleset)} active={active.data?.ruleset} />
      )}
    </>
  );
}
