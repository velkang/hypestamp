import { Link, useNavigate } from "react-router";
import { ChevronIcon, TokenMark } from "../../components/icons";
import { Badge } from "../../components/ui";
import { tradeCode, usdFromE8, utcClock } from "../../lib/format";
import type { Trade } from "../../lib/types";

function StatusBadge({ trade }: { trade: Trade }) {
  if (trade.status === "stamped") return <Badge tone="ok" icon="check">Stamped · replay verified</Badge>;
  if (trade.status === "failed") return <Badge tone="bad" icon="cross">Refused by the ledger</Badge>;
  return <Badge tone="quiet">Awaiting stamp</Badge>;
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  const navigate = useNavigate();
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="text-left text-[12.5px] text-ink-faint">
            {["ID", "Trade", "Agreed", "Size", "Entry", "Status", "UTC"].map((h) => (
              <th key={h} scope="col" className="border-y border-line px-4 py-2.5 font-medium first:pl-6">{h}</th>
            ))}
            <th scope="col" className="border-y border-line pr-6"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} onClick={() => navigate(`/trades/${t.id}`)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-raised">
              <td className="whitespace-nowrap py-3.5 pl-6 pr-4 font-mono text-[12.5px]">
                <Link to={`/trades/${t.id}`} className="text-ink" onClick={(e) => e.stopPropagation()}>{tradeCode(t.id)}</Link>
              </td>
              <td className="whitespace-nowrap px-4">
                <span className="flex items-center gap-2.5 font-semibold">
                  <TokenMark token={t.token} />{t.token}
                  <span className={t.side === "long" ? "text-bull" : "text-bear"}>{t.side === "long" ? "Long" : "Short"}</span>
                </span>
              </td>
              <td className="whitespace-nowrap px-4">{t.kols.length} sources</td>
              <td className="whitespace-nowrap px-4">{t.request.trade.sizePct}%</td>
              <td className="whitespace-nowrap px-4">{usdFromE8(t.entryPriceE8)}</td>
              <td className="whitespace-nowrap px-4"><StatusBadge trade={t} /></td>
              <td className="whitespace-nowrap px-4">{utcClock(t.submittedAt)}</td>
              <td className="pr-6 text-ink-faint"><ChevronIcon /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
