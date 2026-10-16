import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { ApiError } from "../../lib/api";
import { AdminSessionProvider, useAdminOverview, useAdminSession } from "./session";

function Unlock({ error }: { error?: string }) {
  const { unlock } = useAdminSession();
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (value) unlock(value); };
  return (
    <form onSubmit={submit} className="mx-auto mt-[12vh] flex w-full max-w-[380px] flex-col gap-3 rounded-[14px] border border-line bg-panel p-6">
      <h1 className="m-0 text-lg font-semibold">Operator sign-in</h1>
      <p className="m-0 text-[13.5px] text-ink-muted">Enter the owner token (ADMIN_TOKEN in the API's secrets). It stays in this tab only.</p>
      <label htmlFor="owner-token" className="text-[13px] font-medium text-ink-muted">Owner token</label>
      <input id="owner-token" type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        className="h-10 rounded-[9px] border border-line-strong bg-page px-3 text-ink outline-none focus:border-proof" />
      {error && <p role="alert" className="m-0 text-[13.5px] text-bear-ink">{error}</p>}
      <button type="submit" disabled={!value} className="h-10 rounded-[9px] bg-action font-semibold text-white hover:bg-action-hover disabled:opacity-40">Unlock</button>
      <Link to="/" className="text-center text-[13px]">Back to the public site</Link>
    </form>
  );
}

function Gate() {
  const { token, lock } = useAdminSession();
  const overview = useAdminOverview();
  if (!token) return <Unlock />;
  if (overview.isError && overview.error instanceof ApiError && overview.error.status === 401) {
    return <Unlock error="That token was not accepted." />;
  }
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 md:px-10">
          <span className="flex items-center gap-2 text-[17px] font-bold">Hypestamp <span className="rounded-[5px] bg-raised px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-muted">operator</span></span>
          <nav aria-label="Admin" className="flex gap-0.5">
            {[{ to: "/admin", label: "Console", end: true }, { to: "/admin/rulesets/new", label: "Compose ruleset" }].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `rounded-[7px] px-3 py-2 font-medium hover:no-underline ${isActive ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[13.5px]">
            <Link to="/">Public site</Link>
            <button type="button" onClick={lock} className="rounded-[7px] border border-line-strong px-3 py-1.5 font-medium text-ink-muted hover:text-ink">Lock</button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pt-7 pb-12 md:px-10"><Outlet /></main>
    </>
  );
}

export function AdminShell() {
  return <AdminSessionProvider><Gate /></AdminSessionProvider>;
}
