import { describe, expect, it, vi } from "vitest";
import { fetchSourceTweets } from "../src/agent/ingest";

const apiTweet = (id: string, createdAt: string, extra: object = {}) => ({
  id,
  text: `tweet ${id}`,
  createdAt,
  author: { userName: "cobie" },
  likeCount: 5,
  retweeted_tweet: null,
  ...extra,
});

function fakeFetch(body: object, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

const SINCE = Date.parse("2026-10-15T00:00:00Z");

describe("fetchSourceTweets", () => {
  it("requests the handle's timeline with the API key header", async () => {
    const fetch = fakeFetch({ status: "success", data: { tweets: [] } });
    await fetchSourceTweets({ fetch, apiKey: "k", handle: "cobie", since: SINCE });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.twitterapi.io/twitter/user/last_tweets?userName=cobie");
    expect(init.headers["X-API-Key"]).toBe("k");
  });

  it("returns stable fields for original tweets since the cutoff, oldest first", async () => {
    const fetch = fakeFetch({
      status: "success",
      data: {
        tweets: [
          apiTweet("3", "Thu Oct 15 09:00:00 +0000 2026"),
          apiTweet("2", "Thu Oct 15 08:00:00 +0000 2026", { retweeted_tweet: { id: "x" } }),
          apiTweet("1", "Thu Oct 15 07:00:00 +0000 2026"),
          apiTweet("0", "Wed Oct 14 23:00:00 +0000 2026"),
        ],
      },
    });
    const tweets = await fetchSourceTweets({ fetch, apiKey: "k", handle: "cobie", since: SINCE });
    expect(tweets).toEqual([
      { id: "1", author: "cobie", text: "tweet 1", createdAt: "Thu Oct 15 07:00:00 +0000 2026" },
      { id: "3", author: "cobie", text: "tweet 3", createdAt: "Thu Oct 15 09:00:00 +0000 2026" },
    ]);
  });

  it("rejects handles that could alter the query", async () => {
    const fetch = fakeFetch({});
    await expect(fetchSourceTweets({ fetch, apiKey: "k", handle: "cobie&x=1", since: SINCE })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces API failures with the status code", async () => {
    const fetch = fakeFetch({ error: 1 }, 429);
    await expect(fetchSourceTweets({ fetch, apiKey: "k", handle: "cobie", since: SINCE })).rejects.toThrow("429");
  });
});
