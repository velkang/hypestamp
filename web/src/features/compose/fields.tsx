import { useId, type ReactNode } from "react";

export function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 border-t border-line p-0 px-6 py-5">
      <legend className="float-left mb-1 w-full p-0 text-base font-semibold">{title}</legend>
      <p className="clear-both m-0 mb-4 max-w-[70ch] text-[13.5px] text-ink-muted">{hint}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </fieldset>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step: number;
  suffix?: string;
  hint?: string;
};

export function NumberField({ label, value, onChange, min, max, step, suffix, hint }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-muted">{label}</label>
      <div className="flex h-10 items-center rounded-[9px] border border-line-strong bg-page px-3 focus-within:border-proof">
        <input id={id} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          className="w-full min-w-0 bg-transparent text-ink outline-none" />
        {suffix && <span className="pl-2 text-[13px] text-ink-faint">{suffix}</span>}
      </div>
      {hint && <span className="text-[12.5px] text-ink-faint">{hint}</span>}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-muted">{label}</label>
      <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[9px] border border-line-strong bg-page px-3 text-ink outline-none placeholder:text-ink-faint focus:border-proof" />
      {hint && <span className="text-[12.5px] text-ink-faint">{hint}</span>}
    </div>
  );
}
