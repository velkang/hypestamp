import { Link } from "react-router";
import { Empty, Failure, Loading, PageHeader } from "../../components/ui";
import { useReports, useTrades } from "../../lib/api";
import { periodLabel, utcClock, utcDate } from "../../lib/format";
import { TradesTable } from "../trades/TradesTable";
import { ReportReviewStatus } from "../reports/ReportStatus";

export function OverviewPage() {
  const trades = useTrades();
  const reports = useReports();
  const data = trades.data;
  const incomplete = data?.filter((t) => t.replayVerdict === "pending").length ?? 0;
  const mismatches = data?.filter((t) => t.replayVerdict === "mismatch").length ?? 0;
  const latest = reports.data?.[0];
  return <>
    <div><PageHeader title="A clear view of the trading record.">
      {data ? data.length === 0 ? "The agent is waiting for sources to agree under the published trading rules." :
        `${data.length} practice trade${data.length === 1 ? "" : "s"}. ${incomplete ? `${incomplete} incomplete evidence check${incomplete === 1 ? "" : "s"}.` : ""} ${mismatches ? `${mismatches} replay mismatch${mismatches === 1 ? "" : "es"} need review.` : ""}` : "See what the agent decided, why it acted, and whether the evidence can be reproduced."}
    </PageHeader>{data?.some((t) => t.isDemo) && <p className="demo-note">Demo records — shown to explain the review process. Live records are identified separately.</p>}</div>
    <section aria-labelledby="recent-trades"><div className="section-heading"><h2 id="recent-trades" className="section-title">Recent trades</h2><Link to="/trades">View all trades →</Link></div>
      {trades.isPending && <Loading label="trades" />}{trades.isError && <Failure what="trades" error={trades.error} />}
      {data && (data.length ? <><TradesTable trades={data.slice(0, 5)} compact /><p className="quiet-note mt-5">Open a trade to review its source posts and verification results.</p></> : <Empty title="No trades yet">A trade appears only when the published signal and risk rules allow it.</Empty>)}
    </section>
    <section aria-labelledby="latest-report"><h2 id="latest-report" className="section-title">Latest report</h2>
      {reports.isPending && <Loading label="reports" />}{reports.isError && <Failure what="reports" error={reports.error} />}
      {reports.data && !latest && <Empty title="No saved reports yet">Daily reports appear automatically after generation. Each one keeps the findings known at its capture time.</Empty>}
      {latest && <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="m-0 text-xl font-semibold">{periodLabel(latest.period)}</h3><p className="quiet-note my-2">{latest.coverage.demo} demo · {latest.coverage.live} live trades · Captured {utcDate(Date.parse(latest.generatedAt))}, {utcClock(Date.parse(latest.generatedAt))} UTC</p><ReportReviewStatus summary={latest.summary} /></div><Link to={`/reports/${latest.id}`}>Read report →</Link></div>}
    </section>
  </>;
}
