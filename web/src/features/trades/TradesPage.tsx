import { useState } from "react";
import { DemoTag, Empty, Failure, Loading, PageHeader, Panel, Tabs } from "../../components/ui";
import { useStatus, useTrades } from "../../lib/api";
import type { Trade } from "../../lib/types";
import { TradesTable } from "./TradesTable";

type Filter = "all" | Trade["status"];

const EMPTY: Record<Filter, string> = {
  all: "The agent trades only when enough trusted sources agree under the rules in force.",
  stamped: "No trade has been stamped on-chain yet.",
  submitted: "Nothing is waiting for a stamp.",
  failed: "The ledger has not refused any trade.",
};

export function TradesPage() {
  const trades = useTrades();
  const status = useStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const all = trades.data ?? [];
  const shown = filter === "all" ? all : all.filter((t) => t.status === filter);
  const count = (s: Trade["status"]) => all.filter((t) => t.status === s).length;

  return (
    <>
      <PageHeader title={<>Practice trades<DemoTag show={Boolean(status.data?.demo)} /></>}>
        Every paper trade the agent made, the sources that agreed, and whether Chainlink CRE stamped it on-chain.
      </PageHeader>
      <Panel label="Trades">
        <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
          <Tabs label="Filter trades" value={filter} onChange={setFilter}
            tabs={[
              { value: "all", label: "All", count: all.length },
              { value: "stamped", label: "Stamped", count: count("stamped") },
              { value: "submitted", label: "Awaiting stamp", count: count("submitted") },
              { value: "failed", label: "Refused", count: count("failed") },
            ]} />
        </div>
        {trades.isPending && <Loading label="trades" />}
        {trades.isError && <Failure what="trades" error={trades.error} />}
        {trades.data && shown.length === 0 && <Empty title="No trades here">{EMPTY[filter]}</Empty>}
        {shown.length > 0 && <TradesTable trades={shown} />}
      </Panel>
    </>
  );
}
