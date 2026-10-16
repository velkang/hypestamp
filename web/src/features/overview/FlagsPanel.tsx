import { Link } from "react-router";
import { FlagIcon, ShieldIcon } from "../../components/icons";
import { Panel, PanelHeader } from "../../components/ui";
import { useFeed, useTrades } from "../../lib/api";
import { tradeCode, utcClockSeconds } from "../../lib/format";
import { postUrl } from "../../lib/links";

export function FlagsPanel() {
  const feed = useFeed();
  const trades = useTrades();
  const promos = (feed.data?.posts ?? []).filter((p) => p.extraction?.isPromo && !p.extraction.hasDisclosure);
  const byAuthor = [...new Set(promos.map((p) => p.author))].map((author) => promos.filter((p) => p.author === author));
  const refused = (trades.data ?? []).filter((t) => t.status === "failed");

  return (
    <Panel label="Evidence flags">
      <PanelHeader title="Evidence flags"><span className="text-[13px] text-ink-muted">recorded, not verdicts</span></PanelHeader>
      {byAuthor.length === 0 && refused.length === 0 && (
        <p className="m-0 border-t border-line px-6 py-4 text-[13.5px] text-ink-muted">No flags in the current window.</p>
      )}
      {byAuthor.map((posts) => {
        const used = posts.some((p) => p.citedBy.length > 0);
        return (
          <article key={posts[0].author} className="grid grid-cols-[32px_1fr] gap-3 border-t border-line px-6 py-3.5">
            <span className="grid size-8 place-items-center rounded-lg bg-flag/12 text-flag"><FlagIcon /></span>
            <div>
              <b className="block font-semibold">No disclosure marker found</b>
              <p className="my-0.5 text-[13.5px] text-ink-muted">
                {posts.length} promotional post{posts.length > 1 ? "s" : ""} from @{posts[0].author}, e.g. “{posts[0].text.slice(0, 70)}{posts[0].text.length > 70 ? "…" : ""}”
              </p>
              <small className="text-[12.5px] text-ink-faint">
                {used ? "Cited by a trade" : "Not used in any trade"} · <a href={postUrl(posts[0].author, posts[0].id)} target="_blank" rel="noreferrer">View post ↗</a>
              </small>
            </div>
          </article>
        );
      })}
      {refused.map((t) => (
        <article key={t.id} className="grid grid-cols-[32px_1fr] gap-3 border-t border-line px-6 py-3.5">
          <span className="grid size-8 place-items-center rounded-lg bg-action/25 text-proof"><ShieldIcon /></span>
          <div>
            <b className="block font-semibold">No stamp for {tradeCode(t.id)}</b>
            <p className="my-0.5 text-[13.5px] text-ink-muted">Submitted at {utcClockSeconds(t.submittedAt)} UTC; no matching stamp is recorded.</p>
            <small className="text-[12.5px] text-ink-faint">Submission failed or no matching stamp arrived · <Link to={`/trades/${t.id}`}>View trade</Link></small>
          </div>
        </article>
      ))}
    </Panel>
  );
}
