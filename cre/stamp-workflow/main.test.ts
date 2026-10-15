import { describe, expect, test } from "bun:test";
import { TxStatus } from "@chainlink/cre-sdk";
import { parseAction } from "./action";
import { initWorkflow } from "./main";
import { parsePriceE8 } from "./price";
import { toEventSelector } from "viem";
import { assertLedgerEvent, assertWriteSucceeded, EVIDENCE_STAMPED, RULESET_COMMITTED } from "./ledger";
import { orderByRequest, toTweetFields } from "./verify-tweets";

describe("initWorkflow", () => {
  test("registers a single HTTP-triggered handler", () => {
    expect(initWorkflow()).toHaveLength(1);
  });
});

describe("parseAction", () => {
  test("accepts the two supported actions", () => {
    expect(parseAction({ action: "commitRuleset", ruleset: {} }).action).toBe("commitRuleset");
    expect(parseAction({ action: "stampEvidence", request: {} }).action).toBe("stampEvidence");
  });

  test("rejects anything else", () => {
    expect(() => parseAction({ action: "drain" })).toThrow("Unknown action");
    expect(() => parseAction(null)).toThrow("Unknown action");
  });
});

describe("parsePriceE8", () => {
  test("converts a USD price to 8-decimal fixed point", () => {
    expect(parsePriceE8({ chainlink: { usd: 18.25 } }, "chainlink")).toBe(1_825_000_000n);
  });

  test("rounds sub-unit noise instead of truncating", () => {
    expect(parsePriceE8({ chainlink: { usd: 0.1 + 0.2 } }, "chainlink")).toBe(30_000_000n);
  });

  test("rejects a missing or non-positive price", () => {
    expect(() => parsePriceE8({}, "chainlink")).toThrow("No USD price");
    expect(() => parsePriceE8({ chainlink: { usd: 0 } }, "chainlink")).toThrow("No USD price");
  });
});

describe("orderByRequest", () => {
  const a = { id: "1", author: "a", text: "x", createdAt: "t" };
  const b = { id: "2", author: "b", text: "y", createdAt: "t" };

  test("returns tweets in the order they were requested", () => {
    expect(orderByRequest(["2", "1"], [a, b])).toEqual([b, a]);
  });

  test("fails when a requested tweet is missing", () => {
    expect(() => orderByRequest(["1", "3"], [a])).toThrow("Tweet 3 not returned");
  });
});

describe("toTweetFields", () => {
  test("keeps only the stable fields and the author's handle", () => {
    const fields = toTweetFields({
      id: "1",
      text: "gm",
      createdAt: "Thu Oct 15 03:39:15 +0000 2026",
      author: { userName: "VitalikButerin" },
    });
    expect(fields).toEqual({ id: "1", author: "VitalikButerin", text: "gm", createdAt: "Thu Oct 15 03:39:15 +0000 2026" });
  });

  test("rejects a deleted tweet that comes back empty", () => {
    expect(() => toTweetFields({ id: "", text: "", createdAt: "", author: null })).toThrow("Tweet not found");
  });
});

describe("assertWriteSucceeded", () => {
  const txHash = new Uint8Array(32).fill(0xab);

  test("returns the tx hash when the tx and the ledger both succeeded", () => {
    expect(assertWriteSucceeded({ txStatus: TxStatus.SUCCESS, receiverContractExecutionStatus: 0, txHash })).toBe(
      `0x${"ab".repeat(32)}`,
    );
  });

  test("fails when the ledger reverted inside a successful tx", () => {
    expect(() =>
      assertWriteSucceeded({ txStatus: TxStatus.SUCCESS, receiverContractExecutionStatus: 1, txHash }),
    ).toThrow("Ledger rejected the report");
  });

  test("fails when the tx itself failed", () => {
    expect(() => assertWriteSucceeded({ txStatus: TxStatus.REVERTED, errorMessage: "out of gas" })).toThrow(
      "out of gas",
    );
  });
});

describe("assertLedgerEvent", () => {
  const ledger = "0xaB3B70984e300f48Cd3523b15170dDe2A6ad0018";
  const key = `0x${"11".repeat(32)}` as const;
  const log = (address: string, topic0: string, topic1: string) => ({ address, topics: [topic0, topic1] });

  test("passes when the ledger emitted the expected event for this key", () => {
    const logs = [log("0x15fC6ae953E024d975e77382eEeC56A9101f9F88", "0xaa", key), log(ledger.toLowerCase(), EVIDENCE_STAMPED, key)];
    expect(() => assertLedgerEvent(logs, ledger, EVIDENCE_STAMPED, key)).not.toThrow();
  });

  test("fails when only the forwarder logged, i.e. onReport reverted", () => {
    const logs = [log("0x15fC6ae953E024d975e77382eEeC56A9101f9F88", EVIDENCE_STAMPED, key)];
    expect(() => assertLedgerEvent(logs, ledger, EVIDENCE_STAMPED, key)).toThrow("Ledger did not record");
  });

  test("fails when the ledger event is for a different key", () => {
    const logs = [log(ledger, RULESET_COMMITTED, `0x${"22".repeat(32)}`)];
    expect(() => assertLedgerEvent(logs, ledger, RULESET_COMMITTED, key)).toThrow("Ledger did not record");
  });

  test("uses the ledger's real event selectors", () => {
    expect(RULESET_COMMITTED).toBe(toEventSelector("RulesetCommitted(bytes32,uint64)"));
    expect(EVIDENCE_STAMPED).toBe(toEventSelector("EvidenceStamped(bytes32,bytes32,bytes32,uint8,uint256,uint8,uint16)"));
  });
});
