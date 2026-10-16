import { DemoTag, Empty, Failure, Loading, PageHeader, Panel } from "../../components/ui";
import { useStatus, useTrades } from "../../lib/api";
import { TradesTable } from "./TradesTable";

export function TradesPage() {
  const trades = useTrades();
  const status = useStatus();

  return (
    <>
      <PageHeader title={<>Practice trades<DemoTag show={Boolean(status.data?.demo)} /></>}>
        Every paper trade the agent made, the sources that agreed, and whether Chainlink CRE stamped it on-chain.
      </PageHeader>
      <Panel label="Trades">
        {trades.isPending && <Loading label="trades" />}
        {trades.isError && <Failure what="trades" error={trades.error} />}
        {trades.data?.length === 0 && <Empty title="No trades yet">The agent trades only when enough trusted sources agree under the rules in force.</Empty>}
        {trades.data && trades.data.length > 0 && <TradesTable trades={trades.data} />}
      </Panel>
    </>
  );
}
