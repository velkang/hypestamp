import { Link, useParams } from "react-router";
import { EvidenceStatus } from "../../components/EvidenceStatus";
import { Empty, Failure, Loading } from "../../components/ui";
import { useSavedReport } from "../../lib/api";
import { periodLabel, signed, usdFromE8, utcClock, utcDate } from "../../lib/format";
import type { SavedReport } from "../../lib/types";
import { positionLabel } from "../trades/TradesTable";
import { reportVerdict } from "./ReportStatus";

export function downloadReport(report: SavedReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hypestamp-report-${report.period.startDate}-${report.period.endDate}-${report.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportDocument({ report: r }: { report: SavedReport }) {
  const verdict = reportVerdict(r.summary);
  const captured = Date.parse(r.generatedAt);
  const pendingRisk = r.trades.some((t) => t.replay.checks.some((c) => c.name === "request" && c.status === "pending"));
  const title = r.summary.total === 0 ? "No trades in this period" : verdict === "mismatch" ? "Review needed" : verdict === "pending" ? "Review incomplete" : "Evidence checks matched";
  return <article className="report-document">
    <header className="page-header">
      <Link to="/reports" className="back-link no-print">← All reports</Link>
      <h1>Trading evidence report</h1>
      <p className="!text-ink !text-2xl">{periodLabel(r.period)}</p>
      <p className="!text-base">Trades opened on these UTC dates, with outcomes known at capture time.</p>
      <p className="quiet-note !text-sm">Captured {utcDate(captured)}, {utcClock(captured)} UTC · {r.coverage.demo} demo trades · {r.coverage.live} live trades</p>
      {r.period.partial && <p className="demo-note !text-sm">Partial period: includes records available through the capture time.</p>}
    </header>
    <section className={`report-notice status-${verdict}`} aria-labelledby="report-verdict">
      {r.summary.total > 0 && <span className="report-notice-dot" aria-hidden="true" />}
      <div><h2 id="report-verdict">{title}</h2><p>{r.summary.total === 0 ? "No trade decisions were recorded within the selected dates." : verdict === "mismatch" ? `${r.summary.replay.mismatch} trade replay${r.summary.replay.mismatch === 1 ? " differs" : "s differ"} from the recorded evidence and need review.` : verdict === "pending" ?
        `${r.summary.replay.pending} trade${r.summary.replay.pending === 1 ? " has" : "s have"} incomplete checks. ${pendingRisk ? "Historical risk inputs are missing for older records. " : "Some records are still awaiting an entry stamp. "}${r.summary.replay.mismatch === 0 ? "No replay mismatches were detected." : ""}` : "All included decisions reproduce from the saved inputs and match their recorded entry evidence."}</p></div>
    </section>
    <section className="report-section" aria-labelledby="findings"><h2 id="findings" className="section-title">Trade findings</h2>
      {r.trades.length ? <div className="table-wrap" role="region" aria-label="Captured trade findings" tabIndex={0}><table className="data-table">
        <thead><tr>{["Trade", "Entry evidence", "Replay", "Position", "Realized P&L"].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead>
        <tbody>{r.trades.map((t) => <tr key={t.id}>
          <td><Link to={`/trades/${t.id}`} title="View current trade record">{t.token} {t.side === "long" ? "Long" : "Short"}</Link><small>{utcDate(t.submittedAt)}, {utcClock(t.submittedAt)} UTC{t.isDemo ? " · Demo" : ""}</small></td>
          <td>{t.status === "stamped" ? "Recorded" : t.status === "failed" ? "Not recorded" : "Awaiting stamp"}</td>
          <td><EvidenceStatus verdict={t.replay.verdict} /></td><td>{positionLabel(t)}</td><td className="number">{t.pnl ? `${signed(t.pnl.returnPct)}%` : "—"}</td>
        </tr>)}</tbody>
      </table></div> : <Empty title="No trade findings">This empty period is retained as a dated record.</Empty>}
      <p className="quiet-note mt-4">This report is saved. Later changes to a trade will appear in a new report. Trade links open the current record.</p>
    </section>
    {r.promotion.some((p) => p.promo > 0) && <section className="report-section"><h2 className="section-title">Source observations</h2><p className="quiet-note">Saved analysis of posts dated within the period, using the prompt active at capture. These observations are not findings of wrongdoing.</p><div className="table-wrap" role="region" aria-label="Source observations" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Source</th><th scope="col">Posts read</th><th scope="col">Promotional</th><th scope="col">Without disclosure</th></tr></thead><tbody>{r.promotion.filter((p) => p.promo > 0).map((p) => <tr key={p.author}><td>@{p.author}</td><td>{p.posts}</td><td>{p.promo}</td><td>{p.promoWithoutDisclosure}</td></tr>)}</tbody></table></div></section>}
    <section className="report-section no-print"><h2 className="section-title">Keep a copy</h2><p className="quiet-note">The JSON file contains this report’s period, findings, trade summaries and verification results. It is a report, not a complete raw-evidence archive.</p><div className="mt-5 flex flex-wrap items-center gap-7"><button type="button" className="primary-button" onClick={() => downloadReport(r)}>Download report JSON</button><button type="button" className="text-button" onClick={() => window.print()}>Print / save PDF</button></div></section>
    <details className="technical-details report-section"><summary>Methodology and technical details</summary>
      <p>{r.methodology.tradeScope}</p><p>{r.methodology.outcomes}</p><p>{r.methodology.evidence}</p>
      <p className="quiet-note">Report ID: {r.id} · Schema {r.schemaVersion} · {r.source === "daily" ? "Daily generation" : "Operator generation"}</p>
      <p className="quiet-note">{r.methodology.promotionPromptHash ? `Source analysis prompt: ${r.methodology.promotionPromptHash}` : "No active source-analysis prompt was available at capture."}</p>
      {r.trades.map((t) => <div key={t.id} className="mt-7"><h3 className="text-base font-semibold">{t.token} trade {t.id}: captured checks</h3><ul className="pl-5">{t.replay.checks.map((c) => <li key={c.name}><b>{c.name}: {c.status}</b> — {c.detail}</li>)}</ul>{t.closedAt !== null && <p>Exit: {usdFromE8(t.exitPriceE8)} · {t.exitReason} · {utcDate(t.closedAt)}, {utcClock(t.closedAt)} UTC</p>}</div>)}
      <pre>{JSON.stringify({ rulesets: r.rulesets, flagged: r.summary.flagged }, null, 2)}</pre>
    </details>
  </article>;
}

export function ReportPage() {
  const { id = "" } = useParams();
  const report = useSavedReport(id);
  if (report.isPending) return <Loading label="report" />;
  if (report.isError) return <Failure what="report" error={report.error} />;
  return <ReportDocument report={report.data} />;
}
