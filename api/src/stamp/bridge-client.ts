import type { Ruleset } from "../rulesets/schema";
import type { StampRequest } from "./bundle";

type BridgeConfig = { fetch: typeof globalThis.fetch; url: string; token: string };

// Hands work to the CRE trigger. Locally that is scripts/cre-bridge.ts in front of
// `cre workflow simulate`; once the workflow is deployed, the same calls go to the
// CRE gateway. Results arrive asynchronously on the ledger.
export function createBridgeClient({ fetch, url, token }: BridgeConfig) {
  async function post(body: object) {
    const response = await fetch(`${url}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`CRE bridge rejected the job with status ${response.status}`);
  }

  return {
    submitStamp: (request: StampRequest) => post({ action: "stampEvidence", request }),
    commitRuleset: (ruleset: Ruleset) => post({ action: "commitRuleset", ruleset }),
  };
}
