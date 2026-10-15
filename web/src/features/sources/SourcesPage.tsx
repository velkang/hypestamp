import { useState } from "react";
import { Link } from "react-router";
import { ExternalIcon } from "../../components/icons";
import { Badge, Empty, Failure, Loading, PageHeader, Panel, PanelHeader } from "../../components/ui";
import { useFeed, useRuleset, useStatus } from "../../lib/api";
import { relativeTime, signed, tradeCode, utcClock } from "../../lib/format";
import { postUrl } from "../../lib/links";
import type { FeedPost } from "../../lib/types";
import { sourceStats } from "./sourceStats";

function PostRow({ post }: { post: FeedPost }) {
  const e = post.extraction;
  return (
    <article className="border-t border-line px-6 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-ink-muted">
        <span>{utcClock(post.postedAt)} UTC</span>
        <a href={postUrl(post.author, post.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">View on X <ExternalIcon size={12} /></a>
      </div>
      <p className="my-1.5 max-w-[75ch]">{post.text}</p>
      <div className="flex flex-wrap gap-1.5">
        {(e?.mentions ?? []).map((m) => (
          <Badge key={m.token} tone={m.sentiment > 0 ? "ok" : m.sentiment < 0 ? "bad" : "quiet"}>
            {m.token} {signed(m.sentiment)} · conviction {m.conviction.toFixed(2)}
          </Badge>
        ))}
        {e?.isPromo && !e.hasDisclosure && <Badge tone="flag">promotion · no disclosure marker</Badge>}
        {e?.hasDisclosure && <Badge tone="proof">disclosure present</Badge>}
        {!e && <Badge tone="quiet">not read yet</Badge>}
        {e && e.mentions.length === 0 && !e.isPromo && <Badge tone="quiet">no token call</Badge>}
        {post.citedBy.map((id) => <Link key={id} to={`/trades/${id}`} className="text-[12.5px] font-semibold">cited by {tradeCode(id)}</Link>)}
      </div>
    </article>
  );
}

export function SourcesPage() {
  const status = useStatus();
  const feed = useFeed();
  const ruleset = useRuleset(status.data?.activeRuleset?.hash);
  const sources = ruleset.data?.ruleset.sources ?? [];
  const stats = sourceStats(sources, feed.data?.posts ?? []);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? stats[0]?.handle ?? null;
  const posts = (feed.data?.posts ?? []).filter((p) => p.author.toLowerCase() === selected?.toLowerCase());

  if (feed.isPending || ruleset.isPending) return <Panel><Loading label="sources" /></Panel>;
  if (feed.isError) return <Panel><Failure what="sources" error={feed.error} /></Panel>;
  if (sources.length === 0) return <Panel><Empty title="No sources yet">Sources come from the ruleset in force.</Empty></Panel>;

  return (
    <>
      <PageHeader title="Sources">
        The trusted voices named in the ruleset in force, what they posted in the last {status.data?.activeRuleset?.windowHours} h, and what the model read from each post.
      </PageHeader>
      <Panel label="Sources">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12.5px] text-ink-faint">
              {["Source", "Trust", "Posts", "Bullish", "Bearish", "Undisclosed promo", "Cited", "Last post"].map((h) => (
                <th key={h} scope="col" className="border-b border-line px-4 py-3 font-medium first:pl-6 last:pr-6">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.handle} aria-selected={s.handle === selected} onClick={() => setPicked(s.handle)}
                  className={`cursor-pointer border-b border-line last:border-0 ${s.handle === selected ? "bg-raised" : "hover:bg-raised"}`}>
                  <th scope="row" className="py-3 pl-6 text-left font-semibold">
                    <button type="button" onClick={() => setPicked(s.handle)} className="text-ink">@{s.handle}</button>
                  </th>
                  <td className="px-4 font-mono text-[12.5px]">{s.trustWeight}</td>
                  <td className="px-4">{s.posts}</td>
                  <td className="px-4 text-bull">{s.bullish}</td>
                  <td className="px-4 text-bear">{s.bearish}</td>
                  <td className={`px-4 ${s.undisclosedPromo ? "font-semibold text-flag" : ""}`}>{s.undisclosedPromo}</td>
                  <td className="px-4">{s.cited}</td>
                  <td className="px-4 pr-6 text-ink-muted">{s.lastPostAt ? relativeTime(s.lastPostAt) : "none in window"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {selected && (
        <Panel label={`Posts from @${selected}`}>
          <PanelHeader title={`Posts from @${selected}`} meta={`${posts.length} in window · newest first`} />
          {posts.length === 0 ? <Empty title="No posts in this window">This source hasn't posted since the window opened.</Empty> : posts.map((p) => <PostRow key={p.id} post={p} />)}
        </Panel>
      )}
    </>
  );
}
