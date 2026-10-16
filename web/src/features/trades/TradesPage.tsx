import { Empty, Failure, Loading, PageHeader } from "../../components/ui";
import { useTrades } from "../../lib/api";
import { TradesTable } from "./TradesTable";

export function TradesPage() {
  const trades = useTrades();
  const data = trades.data;
  const closed = data?.filter((t) => t.closedAt !== null).length ?? 0;
  return <>
    <div><PageHeader title="Practice trades">What the agent decided, why it acted, and how each position ended.</PageHeader>
      {data?.some((t) => t.isDemo) && <p className="demo-note">Demo records are labelled. No real funds are traded.</p>}</div>
    <section aria-label="All practice trades">
      {trades.isPending && <Loading label="trades" />}{trades.isError && <Failure what="trades" error={trades.error} />}
      {data && (data.length ? <><p className="quiet-note mt-0 mb-7">{data.length} trades · {closed} closed · {data.filter((t) => t.status === "stamped" && t.closedAt === null).length} open</p><TradesTable trades={data} /><p className="quiet-note mt-5">P&amp;L is shown for closed paper positions. Evidence status is checked separately.</p></> : <Empty title="No trades yet">The agent opens a position only when enough sources agree and the trading rules allow it.</Empty>)}
    </section>
  </>;
}
