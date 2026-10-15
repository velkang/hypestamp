import type { TweetFields } from "../stamp/encoding";

const TIMELINE_URL = "https://api.twitterapi.io/twitter/user/last_tweets";
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

type ApiTweet = {
  id: string;
  text: string;
  createdAt: string;
  author: { userName: string } | null;
  retweeted_tweet: unknown;
};

type FetchSourceTweets = {
  fetch: typeof globalThis.fetch;
  apiKey: string;
  handle: string;
  since: number; // epoch ms; older tweets are skipped
};

// One page (the 20 newest) per poll is enough at a 5-minute cadence. Retweets are
// skipped: they are not the source's own call.
export async function fetchSourceTweets({ fetch, apiKey, handle, since }: FetchSourceTweets): Promise<TweetFields[]> {
  if (!HANDLE.test(handle)) throw new Error(`Invalid X handle: ${handle}`);

  const response = await fetch(`${TIMELINE_URL}?userName=${handle}`, { headers: { "X-API-Key": apiKey } });
  if (!response.ok) throw new Error(`twitterapi.io timeline for @${handle} failed with status ${response.status}`);

  const body = (await response.json()) as { data?: { tweets?: ApiTweet[] } };
  return (body.data?.tweets ?? [])
    .filter((tweet) => tweet.id && tweet.author && !tweet.retweeted_tweet && Date.parse(tweet.createdAt) >= since)
    .map((tweet) => ({ id: tweet.id, author: tweet.author!.userName, text: tweet.text, createdAt: tweet.createdAt }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
