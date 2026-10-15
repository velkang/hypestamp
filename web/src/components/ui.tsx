import { useState, type ReactNode } from "react";
import { shortHash } from "../lib/format";
import { CheckIcon, CopyIcon, CrossIcon } from "./icons";

export function Panel({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`min-w-0 rounded-[14px] border border-line bg-panel ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 pt-5 pb-3">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      {meta && <span className="text-[13px] text-ink-muted">{meta}</span>}
      {children && <div className="ml-auto flex items-center gap-3">{children}</div>}
    </div>
  );
}

export function DemoTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex h-5 items-center rounded-[5px] bg-flag/12 px-[7px] align-[2px] text-[11.5px] font-semibold text-flag-ink">
      demo
    </span>
  );
}

type Tone = "ok" | "bad" | "proof" | "flag" | "quiet";
const TONES: Record<Tone, string> = {
  ok: "bg-bull/10 text-bull",
  bad: "bg-bear/12 text-bear-ink",
  proof: "bg-proof/10 text-proof",
  flag: "bg-flag/12 text-flag-ink",
  quiet: "bg-raised text-ink-muted",
};

export function Badge({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: "check" | "cross" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold ${TONES[tone]}`}>
      {icon === "check" && <CheckIcon size={12} />}
      {icon === "cross" && <CrossIcon size={12} />}
      {children}
    </span>
  );
}

export function Hash({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 font-mono text-[12.5px]">
      <span className={full ? "break-all" : ""}>{full ? value : shortHash(value)}</span>
      <button type="button" onClick={copy} aria-label={copied ? "Copied" : `Copy ${value}`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-raised hover:text-ink">
        {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      </button>
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="px-6 py-8 text-[13.5px] text-ink-muted">
      <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-proof align-middle" />
      Loading {label}…
    </div>
  );
}

export function Failure({ what, error }: { what: string; error: unknown }) {
  const reason = error instanceof Error ? error.message : "unknown error";
  return (
    <div role="alert" className="px-6 py-8 text-[13.5px] text-bear-ink">
      Couldn't load {what}: {reason}. Check that the API Worker is running, then refresh.
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-10">
      <p className="m-0 font-semibold">{title}</p>
      <p className="mt-1 mb-0 max-w-[60ch] text-[13.5px] text-ink-muted">{children}</p>
    </div>
  );
}

export function PageHeader({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {back}
      <h1 className="m-0 text-[26px] font-bold tracking-[-0.02em]">{title}</h1>
      {children && <p className="m-0 max-w-[75ch] text-ink-muted">{children}</p>}
    </div>
  );
}

type Tab<T extends string> = { value: T; label: string; count?: number };

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Tab<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-[10px] border border-line-strong bg-panel p-[3px]">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" aria-pressed={tab.value === value} onClick={() => onChange(tab.value)}
          className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium ${tab.value === value ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}>
          {tab.label}{tab.count !== undefined && <span className="ml-1.5 text-ink-faint">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
