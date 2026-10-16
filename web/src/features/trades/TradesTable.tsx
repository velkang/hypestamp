import { Link } from "react-router";
import { EvidenceStatus } from "../../components/EvidenceStatus";
import { signed, usdFromE8, utcClock, utcDate } from "../../lib/format";
import type { Trade } from "../../lib/types";

export function positionLabel(trade: Pick<Trade, "status" | "closedAt" | "exitReason">) {
  if (trade.status === "failed") return "Not opened";
  if (trade.status === "submitted") return "Awaiting stamp";
  if (trade.closedAt === null) return "Open";
  return `Closed · ${trade.exitReason === "take-profit" ? "Take profit" : "Stop loss"}`;
}

export function TradesTable({ trades, compact = false }: { trades: Trade[]; compact?: boolean }) {
  return <div className="table-wrap" role="region" aria-label="Practice trades" tabIndex={0}>
    <table className={`data-table ${compact ? "" : "trade-table"}`}>
      <caption className="sr-only">Practice trade decisions, position outcomes and evidence checks</caption>
      <thead><tr>{["Trade", compact ? "Why it happened" : "Decision", ...(!compact ? ["Entry"] : []), "Position", ...(!compact ? ["Realized P&L"] : []), "Evidence", ""].map((h, i) => <th key={i} scope="col">{h || <span className="sr-only">Open trade</span>}</th>)}</tr></thead>
      <tbody>{trades.map((trade) => <tr key={trade.id}>
        <td><Link className="trade-name" to={`/trades/${trade.id}`}>{trade.token} {trade.side === "long" ? "Long" : "Short"}</Link><small>{utcDate(trade.submittedAt)}, {utcClock(trade.submittedAt)} UTC{trade.isDemo ? " · Demo" : ""}</small></td>
        <td>{trade.kols.length} sources agreed{compact ? ` on ${trade.token}` : ""}{trade.flags.length > 0 && <small className="text-flag-ink">{trade.flags.length} evidence flag{trade.flags.length === 1 ? "" : "s"}</small>}</td>
        {!compact && <td className="number">{usdFromE8(trade.entryPriceE8)}</td>}
        <td>{positionLabel(trade)}</td>
        {!compact && <td className={`number ${trade.pnl ? trade.pnl.returnPct >= 0 ? "text-bull" : "text-bear-ink" : "text-ink-muted"}`}>{trade.pnl ? `${signed(trade.pnl.returnPct)}%` : "—"}</td>}
        <td><EvidenceStatus verdict={trade.replayVerdict} /></td>
        <td><Link to={`/trades/${trade.id}`} aria-label={`Review ${trade.token} ${trade.side} trade ${trade.id}`}>→</Link></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
