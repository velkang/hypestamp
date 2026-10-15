import { ConfidentialHTTPClient, json, ok, type Runtime } from "@chainlink/cre-sdk";
import { tweetHash, type TweetFields } from "../../api/src/stamp/encoding";

export type Config = {
  twitterApiUrl: string;
  owner: string;
};

type ApiTweet = {
  id: string;
  text: string;
  createdAt: string;
  author: { userName: string } | null;
};

export type VerifiedTweet = TweetFields & { hash: string };

export function toTweetFields(tweet: ApiTweet): TweetFields {
  if (!tweet.id || !tweet.author) throw new Error("Tweet not found or deleted");
  return { id: tweet.id, author: tweet.author.userName, text: tweet.text, createdAt: tweet.createdAt };
}

// The request runs once inside the Confidential HTTP enclave; the API key is resolved
// there from the Vault DON secret and never appears in workflow code.
export function fetchVerifiedTweets(runtime: Runtime<Config>, tweetIds: string[]): VerifiedTweet[] {
  const response = new ConfidentialHTTPClient()
    .sendRequest(runtime, {
      request: {
        url: `${runtime.config.twitterApiUrl}?tweet_ids=${tweetIds.join(",")}`,
        method: "GET",
        multiHeaders: { "X-API-Key": { values: ["{{.twitterApiKey}}"] } },
      },
      vaultDonSecrets: [{ key: "twitterApiKey", owner: runtime.config.owner }],
    })
    .result();

  if (!ok(response)) throw new Error(`twitterapi.io request failed with status ${response.statusCode}`);

  const body = json(response) as { tweets: ApiTweet[] };
  return body.tweets.map((tweet) => {
    const fields = toTweetFields(tweet);
    return { ...fields, hash: tweetHash(fields) };
  });
}
