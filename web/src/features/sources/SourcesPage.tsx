import { useState } from "react";
import { Link } from "react-router";
import { Empty, Failure, Loading, PageHeader } from "../../components/ui";
import { useFeed, useRuleset, useStatus } from "../../lib/api";
import { tradeCode, utcDate, utcClock } from "../../lib/format";
import { postUrl } from "../../lib/links";
import type { FeedPost } from "../../lib/types";
import { sourceStats } from "./sourceStats";

function Post({ post }: { post: FeedPost }) {
  const e = post.extraction;
  return <article><div className="flex flex-wrap justify-between gap-2"><b>@{post.author}</b><span className="quiet-note">{utcDate(post.postedAt)}, {utcClock(post.postedAt)} UTC</span></div><p>{post.text}</p>
    <p className="quiet-note">{!e ? "Analysis is not yet available." : e.mentions.length ? e.mentions.map(m => `${m.token}: ${m.sentiment > 0 ? "bullish" : m.sentiment < 0 ? "bearish" : "neutral"}`).join(" · ") : "No token direction identified."}{e?.isPromo ? e.hasDisclosure ? " Promotion detected with a disclosure marker." : " Promotion detected without a disclosure marker." : ""}</p>
    <div className="flex flex-wrap gap-x-5 gap-y-2"><a href={postUrl(post.author,post.id)} target="_blank" rel="noreferrer">View on X ↗</a>{post.citedBy.length ? post.citedBy.map(id => <Link key={id} to={`/trades/${id}`}>Used in {tradeCode(id)} →</Link>) : <span className="quiet-note">Not cited in a trade</span>}</div>
  </article>;
}
export function SourcesPage() {
  const status = useStatus();
  const feed = useFeed();
  const ruleset = useRuleset(status.data?.activeRuleset?.hash);
  const sources = ruleset.data?.ruleset.sources ?? [];
  const stats = sourceStats(sources,feed.data?.posts ?? []);
  const [picked,setPicked] = useState<string | null>(null);
  const selected = stats.some(s => s.handle === picked) ? picked : stats.find(s => s.posts > 0)?.handle ?? stats[0]?.handle;
  const posts = (feed.data?.posts ?? []).filter(p => p.author.toLowerCase() === selected?.toLowerCase());
  return <><PageHeader title="Sources">The accounts the agent follows, what they said, and where their posts informed a decision.</PageHeader>
    {status.isError ? <Failure what="the active trading rules" error={status.error} /> : feed.isError ? <Failure what="source posts" error={feed.error} /> : ruleset.isError ? <Failure what="source selection" error={ruleset.error} /> : status.isPending || feed.isPending || (status.data.activeRuleset && ruleset.isPending) ? <Loading label="sources" /> : sources.length === 0 ? <Empty title="No sources yet">Sources will appear when published trading rules take effect.</Empty> : <>
      <div className="sources-layout"><aside><h2 className="section-title">Accounts</h2><div className="sources-nav">{stats.map(s => <button type="button" key={s.handle} aria-pressed={s.handle === selected} onClick={() => setPicked(s.handle)}><span>@{s.handle}</span><small>{s.posts} {s.posts === 1 ? "post" : "posts"}</small></button>)}</div></aside>
        <section aria-label={`Posts from @${selected}`}><h2 className="section-title">Posts from @{selected}</h2><p className="quiet-note">Within the current {status.data?.activeRuleset?.windowHours}-hour decision window.</p><div className="post-list">{posts.length ? posts.map(p => <Post key={p.id} post={p} />) : <Empty title="No posts in this window">Select another account to see its recent posts.</Empty>}</div></section>
      </div>
      <details className="technical-details"><summary>How sources are selected and weighted</summary><p>Accounts and their trust weights are set in the published trading rules. Agreement and conviction determine whether a post contributes to a trade; following an account does not mean every post is used.</p><Link to={`/rulesets#${status.data?.activeRuleset?.hash}`}>View the trading rules →</Link><dl className="definition-list">{stats.map(s => <div key={s.handle}><dt>@{s.handle}</dt><dd>Trust weight {s.trustWeight} · {s.cited} citations · {s.undisclosedPromo} promotions without disclosure markers</dd></div>)}</dl></details>
      <details className="technical-details"><summary>Post activity timeline</summary><ol>{feed.data?.posts.map(p => <li key={p.id}>{utcDate(p.postedAt)}, {utcClock(p.postedAt)} UTC · @{p.author}</li>)}</ol></details>
    </>}
  </>;
}
