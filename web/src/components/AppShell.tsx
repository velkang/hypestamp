import { NavLink, Outlet } from "react-router";
import { useStatus } from "../lib/api";
import { relativeTime } from "../lib/format";
import { addressUrl, LEDGER_ADDRESS } from "../lib/links";
import { DownloadIcon, InfoIcon, SearchIcon } from "./icons";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/trades", label: "Trades" },
  { to: "/rulesets", label: "Rulesets" },
  { to: "/sources", label: "Sources" },
  { to: "/reports", label: "Reports" },
];

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 text-[17px] font-bold text-ink hover:no-underline">
      <span className="grid size-[26px] place-items-center rounded-[7px] bg-action">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5" /></svg>
      </span>
      Hypestamp
    </NavLink>
  );
}

function AgentStatus() {
  const { data } = useStatus();
  const ran = data?.lastFetchAt ? `agent ran ${relativeTime(data.lastFetchAt)}` : "agent idle";
  return (
    <a href={addressUrl(LEDGER_ADDRESS)} target="_blank" rel="noreferrer"
      className="flex h-[34px] items-center gap-2 rounded-full border border-line-strong px-3 text-[13px] text-ink-muted hover:no-underline hover:text-ink">
      <span className="size-[7px] rounded-full bg-bull" />Sepolia · {ran}
    </a>
  );
}

function DemoBanner() {
  const { data } = useStatus();
  if (!data?.demo) return null;
  return (
    <div className="border-b border-demo-line bg-demo text-[13px] text-demo-ink print:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2.5 px-5 py-2.5 md:px-10">
        <InfoIcon size={15} />
        <span><b>Demo data.</b> Trades and the signal timeline are illustrative until the agent's first live convergence. Rulesets, posts and flags are live on Sepolia.</span>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <>
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 md:px-10">
          <Brand />
          <nav aria-label="Main" className="order-3 flex w-full gap-0.5 overflow-x-auto lg:order-none lg:w-auto">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `whitespace-nowrap rounded-[7px] px-3 py-2 font-medium hover:no-underline ${isActive ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden md:block"><AgentStatus /></div>
            <label className="hidden h-[34px] w-[250px] items-center gap-2 rounded-[9px] border border-line-strong bg-panel px-3 text-[13px] text-ink-faint xl:flex">
              <SearchIcon size={14} />
              <input type="search" placeholder="Search tx, hash, source" aria-label="Search tx, hash, source"
                className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint" />
              <kbd className="rounded-[5px] border border-line-strong px-1.5 text-[11px] text-ink-muted">⌘K</kbd>
            </label>
            <a href="/v1/reports/compliance" download="hypestamp-evidence.json"
              className="flex h-[34px] items-center gap-2 rounded-[9px] bg-action px-3.5 text-[13.5px] font-semibold text-white hover:bg-action-hover hover:no-underline">
              <DownloadIcon size={14} />Export evidence
            </a>
          </div>
        </div>
      </header>
      <DemoBanner />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pt-7 pb-12 md:px-10">
        <Outlet />
      </main>
    </>
  );
}
