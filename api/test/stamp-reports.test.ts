import { describe, expect, it } from "vitest";
import { decodeAbiParameters, keccak256, toBytes } from "viem";
import { encodeCommitRulesetReport, encodeStampEvidenceReport, ReportKind, Side } from "../src/stamp/encoding";

const RULES_A = keccak256(toBytes("ruleset-a"));
const BUNDLE_1 = keccak256(toBytes("bundle-1"));

describe("encodeCommitRulesetReport", () => {
  it("encodes (kind, rulesetHash, effectiveFrom) as the ledger decodes it", () => {
    const report = encodeCommitRulesetReport(RULES_A, 1_800_003_600);
    const [kind, hash, effectiveFrom] = decodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes32" }, { type: "uint64" }],
      report,
    );
    expect(kind).toBe(ReportKind.CommitRuleset);
    expect(hash).toBe(RULES_A);
    expect(effectiveFrom).toBe(1_800_003_600n);
  });
});

describe("encodeStampEvidenceReport", () => {
  const evidence = {
    bundleHash: BUNDLE_1,
    rulesetHash: RULES_A,
    token: "LINK",
    side: Side.Long,
    entryPriceE8: 1_825_000_000n,
    verifiedTweets: 3,
    flags: 0,
  } as const;

  it("encodes every field in ledger order with the token as bytes32", () => {
    const report = encodeStampEvidenceReport(evidence);
    const decoded = decodeAbiParameters(
      [
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint16" },
      ],
      report,
    );
    expect(decoded).toEqual([
      ReportKind.StampEvidence,
      BUNDLE_1,
      RULES_A,
      "0x4c494e4b00000000000000000000000000000000000000000000000000000000",
      Side.Long,
      1_825_000_000n,
      3,
      0,
    ]);
  });

  it("matches the vector the Foundry test feeds to the ledger", () => {
    expect(encodeStampEvidenceReport(evidence)).toMatchSnapshot();
  });

  it("rejects token symbols longer than 32 bytes", () => {
    expect(() => encodeStampEvidenceReport({ ...evidence, token: "X".repeat(33) })).toThrow();
  });
});
