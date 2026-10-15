import { Link } from "react-router";
import { ChevronIcon } from "../../components/icons";
import { DemoTag, Empty, Failure, Loading, Panel, PanelHeader } from "../../components/ui";
import { useStatus, useTrades } from "../../lib/api";
import { TradesTable } from "../trades/TradesTable";
import { FlagsPanel } from "./FlagsPanel";
import { ProofPanel } from "./ProofPanel";
import { RulesetCard } from "./RulesetCard";
import { SignalTimeline } from "./SignalTimeline";

function RecentTrades() {
  const trades = useTrades();
  const status = useStatus();
  return (
    <Panel label="Practice trades">
      <PanelHeader title={<>Practice trades<DemoTag show={Boolean(status.data?.demo)} /></>}>
        <Link to="/trades" className="flex items-center gap-1 text-[13px] font-semibold">All trades<ChevronIcon size={14} /></Link>
      </PanelHeader>
      {trades.isPending && <Loading label="trades" />}
      {trades.isError && <Failure what="trades" error={trades.error} />}
      {trades.data && trades.data.length === 0 && (
        <Empty title="No trades yet">The agent trades only when enough trusted sources agree under the rules in force.</Empty>
      )}
      {trades.data && trades.data.length > 0 && <TradesTable trades={trades.data.slice(0, 5)} />}
    </Panel>
  );
}

export function OverviewPage() {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <RulesetCard />
        <ProofPanel />
      </div>
      <SignalTimeline />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <RecentTrades />
        <FlagsPanel />
      </div>
    </>
  );
}
