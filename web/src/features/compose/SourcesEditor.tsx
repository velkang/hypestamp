import { useState } from "react";
import { CrossIcon } from "../../components/icons";

const MAX_SOURCES = 20;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
type Source = { handle: string; trustWeight: number };

export function SourcesEditor({ sources, onChange }: { sources: Source[]; onChange: (s: Source[]) => void }) {
  const [handle, setHandle] = useState("");
  const clean = handle.trim().replace(/^@/, "");
  const duplicate = sources.some((s) => s.handle.toLowerCase() === clean.toLowerCase());
  const problem = !clean ? null : !HANDLE.test(clean) ? "Use an X handle: letters, digits or _, up to 15 characters." : duplicate ? "Already a source." : null;
  const full = sources.length >= MAX_SOURCES;

  const add = () => {
    if (!clean || problem || full) return;
    onChange([...sources, { handle: clean, trustWeight: 0.5 }]);
    setHandle("");
  };
  const setTrust = (i: number, trustWeight: number) => onChange(sources.map((s, j) => (j === i ? { ...s, trustWeight } : s)));

  return (
    <div className="col-span-full flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sources.map((s, i) => (
          <li key={s.handle} className="grid grid-cols-[minmax(0,1fr)_3.5rem_2.5rem] items-center gap-x-3 gap-y-1 rounded-[10px] sm:grid-cols-[minmax(0,10rem)_1fr_4.5rem_2.5rem] border border-line bg-page px-3 py-2">
            <span className="truncate font-semibold">@{s.handle}</span>
            <input type="range" min={0} max={1} step={0.05} value={s.trustWeight} onChange={(e) => setTrust(i, Number(e.target.value))}
              aria-label={`Trust weight for @${s.handle}`} className="col-span-full row-start-2 w-full accent-[#5EDFAE] sm:col-span-1 sm:row-start-auto" />
            <span className="text-right font-mono text-[12.5px]">{s.trustWeight.toFixed(2)}</span>
            <button type="button" onClick={() => onChange(sources.filter((_, j) => j !== i))} aria-label={`Remove @${s.handle}`}
              className="grid size-9 place-items-center rounded-md text-ink-faint hover:bg-raised hover:text-bear"><CrossIcon size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor="new-source">Add an X handle</label>
        <input id="new-source" value={handle} disabled={full} placeholder={full ? "20 sources is the maximum" : "Add an X handle, e.g. @cobie"}
          onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          aria-invalid={Boolean(problem)} aria-describedby="new-source-hint"
          className="h-10 min-w-0 flex-1 rounded-[9px] border border-line-strong bg-page px-3 text-ink outline-none placeholder:text-ink-faint focus:border-proof aria-invalid:border-bear" />
        <button type="button" onClick={add} disabled={!clean || Boolean(problem) || full}
          className="h-10 rounded-[9px] border border-line-strong px-4 font-semibold text-ink hover:bg-raised disabled:opacity-40">Add source</button>
      </div>
      <span id="new-source-hint" className={`text-[12.5px] ${problem ? "text-bear-ink" : "text-ink-faint"}`}>
        {problem ?? `${sources.length} of ${MAX_SOURCES} sources. Trust weights decide how much each voice counts toward the combined trust threshold.`}
      </span>
    </div>
  );
}
