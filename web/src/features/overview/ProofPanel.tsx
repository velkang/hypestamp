import { Link } from "react-router";
import { CheckIcon, CrossIcon } from "../../components/icons";
import { DemoTag, Hash, Panel, PanelHeader } from "../../components/ui";
import { useFeed, useReplay, useStatus, useTrades } from "../../lib/api";
import { tradeCode } from "../../lib/format";
import { isRealTx, txUrl } from "../../lib/links";
import type { Trade } from "../../lib/types";

function ProofRow({ trade }: { trade: Trade }) {
  const replay = useReplay(trade.id);
  const verdict = replay.data?.verdict;
  const ok = verdict === "match";
  const text = verdict === "match" ? "matches its stamp" : verdict === "mismatch" ? "does not match" : "replaying…";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-line py-3">
      <span className={`grid size-6 place-items-center rounded-md ${ok ? "bg-action/25 text-proof" : "bg-bear/15 text-bear"}`}>
        {verdict === "mismatch" ? <CrossIcon size={13} /> : <CheckIcon size={13} />}
      </span>
      <span>
        <Link to={`/trades/${trade.id}`} className="font-semibold text-ink">{tradeCode(trade.id)} {text}</Link>
        {trade.bundleHash && <span className="block text-[13px] text-ink-muted">bundle <Hash value={trade.bundleHash} /></span>}
      </span>
      {isRealTx(trade.txHash) ? (
        <a href={txUrl(trade.txHash)} target="_blank" rel="noreferrer" className="font-mono text-[12.5px]">tx ↗</a>
      ) : (
        <span className="font-mono text-[12.5px] text-ink-faint">{trade.isDemo ? "demo" : "pending"}</span>
      )}
    </div>
  );
}

export function ProofPanel() {
  const trades = useTrades();
  const feed = useFeed();
  const status = useStatus();
  const stamped = (trades.data ?? []).filter((t) => t.status === "stamped").slice(0, 3);
  const tradedFlags = (trades.data ?? []).filter((t) => t.flags.length > 0).length;
  const watched = (feed.data?.posts ?? []).filter((p) => p.extraction?.isPromo && !p.extraction.hasDisclosure).length;

  return (
    <Panel label="Proof" className="px-6 pt-1 pb-5">
      <div className="-mx-6"><PanelHeader title={<>Proof<DemoTag show={Boolean(status.data?.demo)} /></>} meta="replayed from saved inputs" /></div>
      {stamped.length === 0 ? (
        <p className="m-0 border-t border-line py-4 text-[13.5px] text-ink-muted">No stamped trades yet. Each one appears here with its replay result.</p>
      ) : (
        stamped.map((t) => <ProofRow key={t.id} trade={t} />)
      )}
      <div className="flex justify-between border-t border-line pt-2.5 text-[13.5px] text-ink-muted">
        <span>Flags on traded evidence</span><b className="font-semibold text-ink">{tradedFlags}</b>
      </div>
      <div className="flex justify-between pt-1.5 text-[13.5px] text-ink-muted">
        <span>Flags on watched posts</span><b className="font-semibold text-ink">{watched ? `${watched} · undisclosed promotion` : "0"}</b>
      </div>
    </Panel>
  );
}
