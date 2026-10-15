import { decodeJson, handler, HTTPCapability, Runner, type HTTPPayload, type Runtime } from "@chainlink/cre-sdk";
import { bundleHash, parseStampRequest, sideCode } from "../../api/src/stamp/bundle";
import { encodeCommitRulesetReport, encodeStampEvidenceReport, rulesetHash } from "../../api/src/stamp/encoding";
import { parseRuleset } from "../../api/src/rulesets/schema";
import { parseAction } from "./action";
import type { Config } from "./config";
import { confirmLedgerEvent, EVIDENCE_STAMPED, RULESET_COMMITTED, writeToLedger } from "./ledger";
import { fetchEntryPriceE8 } from "./price";
import { fetchVerifiedTweets } from "./verify-tweets";

// The workflow hashes the full ruleset itself, so the on-chain hash is attested by
// the DON rather than asserted by the agent.
function commitRuleset(runtime: Runtime<Config>, input: unknown): string {
  const ruleset = parseRuleset(input);
  const hash = rulesetHash(ruleset);
  const txHash = writeToLedger(runtime, encodeCommitRulesetReport(hash, ruleset.effectiveFrom));
  confirmLedgerEvent(runtime, txHash, RULESET_COMMITTED, hash);
  runtime.log(`committed ruleset ${hash} effective ${ruleset.effectiveFrom} tx=${txHash}`);
  return JSON.stringify({ rulesetHash: hash, txHash });
}

function stampEvidence(runtime: Runtime<Config>, input: unknown): string {
  const request = parseStampRequest(input);
  const tweets = fetchVerifiedTweets(runtime, request.tweetIds);
  const entryPriceE8 = fetchEntryPriceE8(runtime, request.signal.coingeckoId);
  const hash = bundleHash(
    request,
    tweets.map(({ id, hash }) => ({ id, hash })),
    entryPriceE8,
  );

  const report = encodeStampEvidenceReport({
    bundleHash: hash,
    rulesetHash: request.rulesetHash as `0x${string}`,
    token: request.signal.token,
    side: sideCode(request.signal.side),
    entryPriceE8,
    verifiedTweets: tweets.length,
    flags: request.flags,
  });
  const txHash = writeToLedger(runtime, report);
  confirmLedgerEvent(runtime, txHash, EVIDENCE_STAMPED, hash);
  runtime.log(`stamped bundle ${hash} under ${request.rulesetHash} price=${entryPriceE8} tx=${txHash}`);
  return JSON.stringify({ bundleHash: hash, entryPriceE8: entryPriceE8.toString(), tweets, txHash });
}

export const onRequest = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const parsed = parseAction(decodeJson(payload.input));
  return parsed.action === "commitRuleset"
    ? commitRuleset(runtime, parsed.ruleset)
    : stampEvidence(runtime, parsed.request);
};

export const initWorkflow = () => {
  const http = new HTTPCapability();
  // Empty trigger config is accepted in simulation; authorizedKeys are required before deploy.
  return [handler(http.trigger({}), onRequest)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
