import { decodeJson, handler, HTTPCapability, Runner, type HTTPPayload, type Runtime } from "@chainlink/cre-sdk";
import { fetchVerifiedTweets, type Config } from "./verify-tweets";

type StampRequest = { tweetIds: string[] };

export const onStampRequest = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const { tweetIds } = decodeJson(payload.input) as StampRequest;
  if (!Array.isArray(tweetIds) || tweetIds.length === 0 || tweetIds.length > 10) {
    throw new Error("tweetIds must list 1 to 10 tweet IDs");
  }

  const verified = fetchVerifiedTweets(runtime, tweetIds);
  for (const tweet of verified) runtime.log(`verified ${tweet.id} by @${tweet.author} hash=${tweet.hash}`);
  return JSON.stringify(verified.map(({ id, hash }) => ({ id, hash })));
};

export const initWorkflow = () => {
  const http = new HTTPCapability();
  // Empty trigger config is accepted in simulation; authorizedKeys are required before deploy.
  return [handler(http.trigger({}), onStampRequest)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
