// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {HypestampLedger} from "../src/HypestampLedger.sol";
import {ReceiverTemplate} from "../src/chainlink/ReceiverTemplate.sol";

contract HypestampLedgerTest is Test {
  HypestampLedger internal ledger;

  address internal constant FORWARDER = address(0xF0F0);
  uint64 internal constant COOLDOWN = 1 hours;
  uint64 internal constant START = 1_800_000_000;

  bytes32 internal constant RULES_A = keccak256("ruleset-a");
  bytes32 internal constant RULES_B = keccak256("ruleset-b");
  bytes32 internal constant BUNDLE_1 = keccak256("bundle-1");
  bytes32 internal constant BUNDLE_2 = keccak256("bundle-2");
  bytes32 internal constant LINK = bytes32("LINK");

  event CooldownUpdated(uint64 previousCooldown, uint64 newCooldown);
  event RulesetCommitted(bytes32 indexed rulesetHash, uint64 effectiveFrom);
  event RulesetSuperseded(bytes32 indexed rulesetHash, uint64 supersededAt);
  event EvidenceStamped(
    bytes32 indexed bundleHash,
    bytes32 indexed rulesetHash,
    bytes32 indexed token,
    HypestampLedger.Side side,
    uint256 entryPriceE8,
    uint8 verifiedTweets,
    uint16 flags
  );

  function setUp() public {
    vm.warp(START);
    ledger = new HypestampLedger(FORWARDER, COOLDOWN);
  }

  // ---------- helpers ----------

  function _commit(bytes32 rulesetHash, uint64 effectiveFrom) internal {
    vm.prank(FORWARDER);
    ledger.onReport("", abi.encode(HypestampLedger.ReportKind.CommitRuleset, rulesetHash, effectiveFrom));
  }

  function _stampReport(bytes32 bundleHash, bytes32 rulesetHash) internal pure returns (bytes memory) {
    return abi.encode(
      HypestampLedger.ReportKind.StampEvidence,
      bundleHash,
      rulesetHash,
      LINK,
      HypestampLedger.Side.Long,
      uint256(18_25000000),
      uint8(3),
      uint16(0)
    );
  }

  function _stamp(bytes32 bundleHash, bytes32 rulesetHash) internal {
    vm.prank(FORWARDER);
    ledger.onReport("", _stampReport(bundleHash, rulesetHash));
  }

  // ---------- access ----------

  function test_RejectsReportsNotFromForwarder() public {
    vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), FORWARDER));
    ledger.onReport("", abi.encode(HypestampLedger.ReportKind.CommitRuleset, RULES_A, START + COOLDOWN));
  }

  function test_RejectsUnknownReportKind() public {
    vm.prank(FORWARDER);
    vm.expectRevert();
    ledger.onReport("", abi.encode(uint8(7), RULES_A, START + COOLDOWN));
  }

  // ---------- cooldown setting ----------

  function test_ConstructorSetsCooldown() public view {
    assertEq(ledger.cooldown(), COOLDOWN);
  }

  function test_OwnerCanChangeCooldownAndItIsAnnounced() public {
    vm.expectEmit(address(ledger));
    emit CooldownUpdated(COOLDOWN, 2 minutes);
    ledger.setCooldown(2 minutes);
    assertEq(ledger.cooldown(), 2 minutes);
  }

  function test_NonOwnerCannotChangeCooldown() public {
    vm.prank(address(0xBAD));
    vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", address(0xBAD)));
    ledger.setCooldown(0);
  }

  function test_NewCooldownAppliesToLaterCommits() public {
    ledger.setCooldown(2 minutes);
    _commit(RULES_A, START + 2 minutes);

    vm.warp(START + 1);
    vm.expectRevert(
      abi.encodeWithSelector(HypestampLedger.CooldownNotRespected.selector, START + 2 minutes, START + 2 minutes + 1)
    );
    _commit(RULES_B, START + 2 minutes);
  }

  // ---------- committing rulesets ----------

  function test_CommitRecordsRulesetAndEmits() public {
    vm.expectEmit(address(ledger));
    emit RulesetCommitted(RULES_A, START + COOLDOWN);
    _commit(RULES_A, START + COOLDOWN);

    (uint64 effectiveFrom, uint64 supersededAt) = ledger.rulesets(RULES_A);
    assertEq(effectiveFrom, START + COOLDOWN);
    assertEq(supersededAt, 0);
    assertEq(ledger.latestRuleset(), RULES_A);
  }

  function test_CommitRejectsEffectiveFromInsideCooldown() public {
    uint64 tooSoon = START + COOLDOWN - 1;
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.CooldownNotRespected.selector, tooSoon, START + COOLDOWN));
    _commit(RULES_A, tooSoon);
  }

  function test_CommitRejectsDuplicateHash() public {
    _commit(RULES_A, START + COOLDOWN);
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.RulesetAlreadyCommitted.selector, RULES_A));
    _commit(RULES_A, START + COOLDOWN + 10);
  }

  function test_CommitRejectsEffectiveFromNotAfterLatest() public {
    _commit(RULES_A, START + 2 hours);
    vm.expectRevert(
      abi.encodeWithSelector(HypestampLedger.EffectiveFromNotAfterLatest.selector, START + 2 hours, START + 2 hours)
    );
    _commit(RULES_B, START + 2 hours);
  }

  function test_NewRulesetSupersedesPreviousAtItsEffectiveFrom() public {
    _commit(RULES_A, START + COOLDOWN);
    vm.warp(START + COOLDOWN + 10);

    vm.expectEmit(address(ledger));
    emit RulesetSuperseded(RULES_A, START + 3 hours);
    _commit(RULES_B, START + 3 hours);

    (, uint64 supersededAt) = ledger.rulesets(RULES_A);
    assertEq(supersededAt, START + 3 hours);
    assertEq(ledger.latestRuleset(), RULES_B);
  }

  // ---------- active window ----------

  function test_IsActiveOnlyBetweenEffectiveFromAndSupersession() public {
    _commit(RULES_A, START + COOLDOWN);
    _commit(RULES_B, START + 3 hours);

    assertFalse(ledger.isActive(RULES_A, START + COOLDOWN - 1));
    assertTrue(ledger.isActive(RULES_A, START + COOLDOWN));
    assertTrue(ledger.isActive(RULES_A, START + 3 hours - 1));
    assertFalse(ledger.isActive(RULES_A, START + 3 hours));
    assertTrue(ledger.isActive(RULES_B, START + 3 hours));
    assertFalse(ledger.isActive(keccak256("never-committed"), START + 3 hours));
  }

  // ---------- stamping evidence ----------

  function test_StampRecordsEvidenceUnderActiveRuleset() public {
    _commit(RULES_A, START + COOLDOWN);
    vm.warp(START + COOLDOWN + 5);

    vm.expectEmit(address(ledger));
    emit EvidenceStamped(BUNDLE_1, RULES_A, LINK, HypestampLedger.Side.Long, 18_25000000, 3, 0);
    _stamp(BUNDLE_1, RULES_A);

    (bytes32 rulesetHash, uint64 stampedAt) = ledger.evidence(BUNDLE_1);
    assertEq(rulesetHash, RULES_A);
    assertEq(stampedAt, START + COOLDOWN + 5);
  }

  function test_StampRejectsUncommittedRuleset() public {
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.RulesetNotActive.selector, RULES_A, START));
    _stamp(BUNDLE_1, RULES_A);
  }

  function test_StampRejectsRulesetStillInCooldown() public {
    _commit(RULES_A, START + COOLDOWN);
    vm.warp(START + COOLDOWN - 1);
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.RulesetNotActive.selector, RULES_A, START + COOLDOWN - 1));
    _stamp(BUNDLE_1, RULES_A);
  }

  function test_StampRejectsSupersededRuleset() public {
    _commit(RULES_A, START + COOLDOWN);
    _commit(RULES_B, START + 3 hours);
    vm.warp(START + 3 hours);
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.RulesetNotActive.selector, RULES_A, START + 3 hours));
    _stamp(BUNDLE_1, RULES_A);

    _stamp(BUNDLE_1, RULES_B);
  }

  function test_StampRejectsDuplicateBundle() public {
    _commit(RULES_A, START + COOLDOWN);
    vm.warp(START + COOLDOWN);
    _stamp(BUNDLE_1, RULES_A);
    vm.expectRevert(abi.encodeWithSelector(HypestampLedger.EvidenceAlreadyStamped.selector, BUNDLE_1));
    _stamp(BUNDLE_1, RULES_A);

    _stamp(BUNDLE_2, RULES_A);
  }

  // ---------- cross-check with api encoding ----------

  // Snapshot of encodeStampEvidenceReport in api/test/stamp-reports.test.ts. If either side changes
  // its layout, one of the two tests fails.
  bytes internal constant API_STAMP_REPORT =
    hex"0000000000000000000000000000000000000000000000000000000000000001a916eeadfac2e468108ab83bb8b3872e52cdfba8f979aa7526f75e1a37849bd1871be45b6ad044a78585e8bb3fee9d789ddc4e0445d615d1dc49ee89b92364df4c494e4b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006cc74a4000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000";

  function test_AcceptsReportEncodedByApi() public {
    assertEq(API_STAMP_REPORT, _stampReport(BUNDLE_1, RULES_A));

    _commit(RULES_A, START + COOLDOWN);
    vm.warp(START + COOLDOWN);
    vm.prank(FORWARDER);
    ledger.onReport("", API_STAMP_REPORT);

    (bytes32 rulesetHash,) = ledger.evidence(BUNDLE_1);
    assertEq(rulesetHash, RULES_A);
  }

  // ---------- fuzz ----------

  function testFuzz_CooldownBoundary(uint64 delay) public {
    delay = uint64(bound(delay, 0, 30 days));
    uint64 effectiveFrom = START + delay;
    if (delay < COOLDOWN) {
      vm.expectRevert(
        abi.encodeWithSelector(HypestampLedger.CooldownNotRespected.selector, effectiveFrom, START + COOLDOWN)
      );
    }
    _commit(RULES_A, effectiveFrom);
  }
}
