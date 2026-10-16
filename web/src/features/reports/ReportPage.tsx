import { DownloadIcon } from "../../components/icons";
import { Failure, Loading, Panel } from "../../components/ui";
import { useReport, useStatus } from "../../lib/api";
import { shortHash, utcClock, utcDate } from "../../lib/format";
import { LEDGER_ADDRESS } from "../../lib/links";
import type { ComplianceReport } from "../../lib/types";

function summary(r: ComplianceReport): string {
  const { stamped, failed } = r.trades;
  const parts = [
    `${stamped} practice trade${stamped === 1 ? " was" : "s were"} stamped on-chain under rulesets committed before they took effect.`,
    r.replay.mismatch === 0 && r.replay.pending === 0
      ? `Every trade replayed from its stored inputs reproduces the record Chainlink CRE wrote to the ledger.`
      : `${r.replay.mismatch} replay mismatches and ${r.replay.pending} incomplete replays need review.`,
  ];
  if (failed) parts.push(`${failed} trade submission${failed === 1 ? " has" : "s have"} no matching stamp recorded; this does not establish a ledger refusal.`);
  const flagged = Object.values(r.flagged).reduce((a, b) => a + b, 0);
  parts.push(flagged ? `${flagged} trade${flagged === 1 ? " carries" : "s carry"} an evidence flag.` : "No trade carries an evidence flag.");
  return parts.join(" ");
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2.5 pr-4 text-left font-medium">{label}</th>
      <td className={`py-2.5 text-right ${strong ? "font-semibold text-proof" : ""}`}>{value}</td>
    </tr>
  );
}

function Document({ r, demo }: { r: ComplianceReport; demo: boolean }) {
  const generated = Date.parse(r.generatedAt);
  const clean = r.replay.mismatch === 0;
  return (
    <article className="mx-auto w-full max-w-[880px] rounded-[6px] border border-line bg-panel px-6 py-10 md:px-16 md:py-14 print:border-0 print:bg-white print:text-black">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Hypestamp evidence report{demo ? " · contains demo data" : ""}</p>
          <h1 className="mt-1.5 mb-0 text-[28px] font-bold tracking-[-0.01em]">Trading conduct under pre-committed rules</h1>
        </div>
        <span className={`-rotate-3 rounded-md border-[3px] px-3 py-1.5 text-[13px] font-bold tracking-[0.12em] ${clean ? "border-proof text-proof" : "border-bear text-bear"}`}>
          {clean ? "0 MISMATCHES" : `${r.replay.mismatch} MISMATCH${r.replay.mismatch === 1 ? "" : "ES"}`}
        </span>
      </header>
      <dl className="mt-6 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-ink-muted">Generated</dt><dd className="m-0">{utcDate(generated)}, {utcClock(generated)} UTC</dd></div>
        <div><dt className="text-ink-muted">Network</dt><dd className="m-0">Ethereum Sepolia</dd></div>
        <div><dt className="text-ink-muted">Ledger contract</dt><dd className="m-0 font-mono text-[12.5px]">{shortHash(LEDGER_ADDRESS)}</dd></div>
        <div><dt className="text-ink-muted">Ruleset in force</dt><dd className="m-0 font-mono text-[12.5px]">{r.activeRuleset ? shortHash(r.activeRuleset) : "none"}</dd></div>
      </dl>
      <section className="mt-8"><h2 className="m-0 mb-2 text-lg font-semibold">Summary</h2><p className="m-0 max-w-[70ch]">{summary(r)}</p></section>
      <section className="mt-8">
        <h2 className="m-0 mb-2 text-lg font-semibold">Findings</h2>
        <table className="w-full border-collapse text-[14px]"><tbody>
          <Row label="Rulesets committed" value={r.rulesets} />
          <Row label="Trades stamped / awaiting / not stamped" value={`${r.trades.stamped} / ${r.trades.submitted} / ${r.trades.failed}`} />
          <Row label="Replay: match / mismatch / pending" value={`${r.replay.match} / ${r.replay.mismatch} / ${r.replay.pending}`} strong />
          <Row label="Flagged: undisclosed promo / coordinated burst / paid marker" value={`${r.flagged["undisclosed-promo"] ?? 0} / ${r.flagged["coordinated-burst"] ?? 0} / ${r.flagged["paid-marker"] ?? 0}`} />
        </tbody></table>
      </section>
      <section className="mt-8">
        <h2 className="m-0 mb-1 text-lg font-semibold">Promotion without disclosure</h2>
        <p className="m-0 mb-3 text-[13.5px] text-ink-muted">Posts the extraction model read as promotion, with no paid relationship or position disclosed. These are recorded observations, not findings of wrongdoing.</p>
        {r.promotion.filter((p) => p.promo > 0).length === 0 ? <p className="m-0 text-[14px]">None recorded.</p> : (
          <table className="w-full border-collapse text-[14px]">
            <thead><tr className="text-[13px] text-ink-muted"><th className="py-2 text-left font-medium">Source</th><th className="py-2 text-right font-medium">Posts read</th><th className="py-2 text-right font-medium">Promotional</th><th className="py-2 text-right font-medium">Undisclosed</th></tr></thead>
            <tbody>{r.promotion.filter((p) => p.promo > 0).map((p) => (
              <tr key={p.author} className="border-t border-line">
                <th scope="row" className="py-2.5 text-left font-semibold">@{p.author}</th>
                <td className="py-2.5 text-right">{p.posts}</td><td className="py-2.5 text-right">{p.promo}</td>
                <td className="py-2.5 text-right font-semibold text-flag">{p.promoWithoutDisclosure}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <section className="mt-8 rounded-lg bg-page px-5 py-4 print:bg-white">
        <h2 className="m-0 mb-2 text-base font-semibold">Verify this report yourself</h2>
        <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[14px]">
          <li>Fetch each ruleset's committed JSON from <code className="font-mono text-[12.5px]">/v1/rulesets/&#123;hash&#125;</code> and check that its keccak256 equals the on-chain ID.</li>
          <li>Read the ledger's RulesetCommitted, CooldownUpdated and EvidenceStamped events on Etherscan.</li>
          <li>Replay any trade from <code className="font-mono text-[12.5px]">/v1/trades/&#123;id&#125;/replay</code>; every check must pass.</li>
        </ol>
      </section>
    </article>
  );
}

export function ReportPage() {
  const report = useReport();
  const status = useStatus();
  if (report.isPending) return <Panel><Loading label="the report" /></Panel>;
  if (report.isError) return <Panel><Failure what="the report" error={report.error} /></Panel>;
  return (
    <>
      <div className="mx-auto flex w-full max-w-[880px] flex-wrap justify-end gap-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="h-10 rounded-[9px] border border-line-strong px-4 font-semibold hover:bg-raised">Print or save as PDF</button>
        <a href="/v1/reports/compliance" download="hypestamp-report.json" className="flex h-10 items-center gap-2 rounded-[9px] bg-action px-4 font-semibold text-white hover:bg-action-hover hover:no-underline"><DownloadIcon size={14} />Download JSON</a>
      </div>
      <Document r={report.data} demo={Boolean(status.data?.demo)} />
    </>
  );
}
