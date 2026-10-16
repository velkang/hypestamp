import { Link } from "react-router";
import { Badge, Failure, Loading, PageHeader, Panel, PanelHeader } from "../../components/ui";
import { relativeTime, shortHash, utcClockSeconds, utcDate } from "../../lib/format";
import { isRealTx, txUrl } from "../../lib/links";
import type { AdminOverview, AdminRuleset } from "../../lib/types";
import { useAdminOverview } from "./session";

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={`m-0 text-[17px] font-semibold ${tone === "bad" ? "text-bear-ink" : ""}`}>{value}</dd>
    </div>
  );
}

function Health({ data }: { data: AdminOverview }) {
  const { agent, trades } = data;
  return (
    <Panel label="Agent health">
      <PanelHeader title="Agent health" />
      <dl className="m-0 grid grid-cols-1 border-t border-line sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Last fetch" value={agent.lastFetchAt ? relativeTime(agent.lastFetchAt) : "never"} />
        <Stat label="Ledger synced to block" value={agent.lastSyncedBlock ?? "not yet"} />
        <Stat label="CRE bridge" value={agent.bridgeUp ? "Reachable" : "Down"} tone={agent.bridgeUp ? undefined : "bad"} />
        <Stat label="Stamped trades" value={trades.stamped} />
        <Stat label="Awaiting stamp" value={trades.submitted} />
        <Stat label="Not stamped" value={trades.failed} tone={trades.failed > 0 ? "bad" : undefined} />
      </dl>
      {!agent.bridgeUp && (
        <p className="m-0 border-t border-line px-6 py-3 text-[13.5px] text-bear-ink">
          Nothing can go on-chain until the bridge is running: <code className="font-mono text-[12.5px]">bun cre/bridge/server.ts</code>
        </p>
      )}
    </Panel>
  );
}

const STATUS: Record<AdminRuleset["status"], { tone: "ok" | "flag" | "bad"; label: string }> = {
  confirmed: { tone: "ok", label: "On-chain" },
  pending: { tone: "flag", label: "Awaiting chain" },
  failed: { tone: "bad", label: "Failed" },
};

function Rulesets({ rulesets }: { rulesets: AdminRuleset[] }) {
  return (
    <Panel label="Rulesets">
      <PanelHeader title="Rulesets" meta="every submission, including ones that never reached the ledger">
        <Link to="/admin/rulesets/new" className="inline-flex h-9 items-center rounded-[9px] bg-action px-3.5 text-[13.5px] font-semibold text-white hover:bg-action-hover hover:no-underline">Compose new ruleset</Link>
      </PanelHeader>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
          <thead className="text-[12.5px] text-ink-muted">
            <tr>{["Status", "Ruleset", "Submitted", "Effective", "Sources", "Tx"].map((h) => <th key={h} className="px-6 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rulesets.map((r) => (
              <tr key={r.hash} className="border-t border-line">
                <td className="px-6 py-3"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                <td className="px-6 py-3 font-mono text-[12.5px]">{shortHash(r.hash)}</td>
                <td className="px-6 py-3">{utcDate(r.committedAt)} {utcClockSeconds(r.committedAt)}</td>
                <td className="px-6 py-3">{utcClockSeconds(r.effectiveFrom * 1000)} UTC</td>
                <td className="px-6 py-3">{r.sources}</td>
                <td className="px-6 py-3">{isRealTx(r.commitTx) ? <a href={txUrl(r.commitTx!)} target="_blank" rel="noreferrer" className="font-mono text-[12.5px]">{shortHash(r.commitTx!)} ↗</a> : <span className="text-ink-faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function ConsolePage() {
  const overview = useAdminOverview();
  return (
    <>
      <PageHeader title="Operator console">Health of the agent and the bridge to Chainlink CRE, and every ruleset you have submitted.</PageHeader>
      {overview.isPending && <Panel><Loading label="the console" /></Panel>}
      {overview.isError && <Panel><Failure what="the console" error={overview.error} /></Panel>}
      {overview.data && <><Health data={overview.data} /><Rulesets rulesets={overview.data.rulesets} /></>}
    </>
  );
}
