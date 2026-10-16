import { Link } from "react-router";
import { Empty, Failure, Loading, PageHeader } from "../../components/ui";
import { useReports } from "../../lib/api";
import { periodLabel, utcClock, utcDate } from "../../lib/format";
import { ReportReviewStatus } from "./ReportStatus";

export function ReportsPage() {
  const reports = useReports();
  return <>
    <PageHeader title="Evidence reports">Saved records of what the agent traded and what the evidence checks showed.</PageHeader>
    <section aria-label="Saved reports">
      <p className="quiet-note mt-0 mb-9">Each report stays unchanged after it is created.</p>
      {reports.isPending && <Loading label="reports" />}{reports.isError && <Failure what="reports" error={reports.error} />}
      {reports.data && (reports.data.length ? <div className="table-wrap" role="region" aria-label="Report history" tabIndex={0}><table className="data-table">
        <caption className="sr-only">Saved evidence reports and their coverage</caption>
        <thead><tr>{["Trading period", "Captured", "Records", "Review status", ""].map((h, i) => <th scope="col" key={i}>{h || <span className="sr-only">Read</span>}</th>)}</tr></thead>
        <tbody>{reports.data.map((r) => <tr key={r.id}>
          <td><Link to={`/reports/${r.id}`} className="trade-name">{periodLabel(r.period)}</Link><small>{r.source === "daily" ? "Daily report" : "Custom period"}{r.period.partial ? " · Partial period" : ""}</small></td>
          <td>{utcDate(Date.parse(r.generatedAt))}<small>{utcClock(Date.parse(r.generatedAt))} UTC</small></td>
          <td>{r.coverage.demo} demo · {r.coverage.live} live trades</td>
          <td><ReportReviewStatus summary={r.summary} /></td>
          <td><Link to={`/reports/${r.id}`} aria-label={`Read report for ${periodLabel(r.period)}`}>Read report →</Link></td>
        </tr>)}</tbody>
      </table></div> : <Empty title="No saved reports yet">Daily reports are saved after generation. The operator can also create a report for a custom period.</Empty>)}
      <p className="quiet-note mt-6">Periods include trades opened on those dates. Position outcomes reflect each report’s capture time.</p>
    </section>
    <details className="technical-details"><summary>How reports are generated</summary><p>Each daily report covers the previous UTC day. The operator can choose a custom date range. The system captures stored evidence, replays the included trade decisions, and saves the findings together. Later changes appear in a new report.</p><p className="quiet-note">Incomplete checks remain incomplete; zero mismatches alone does not mean every trade is fully verified. Reports describe evidence, not legal conclusions.</p></details>
  </>;
}
