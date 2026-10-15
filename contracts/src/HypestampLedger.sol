// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReceiverTemplate} from "./chainlink/ReceiverTemplate.sol";

/// @title HypestampLedger
/// @notice Append-only record of pre-committed trading rulesets and the evidence stamped under them.
/// @dev Written only by the Chainlink CRE forwarder. A ruleset must be committed at least `COOLDOWN`
///      seconds before it takes effect (like a Rule 10b5-1 cooling-off period), and evidence is accepted
///      only under the ruleset active at block time, so neither rules nor evidence can be backdated.
contract HypestampLedger is ReceiverTemplate {
  enum ReportKind {
    CommitRuleset,
    StampEvidence
  }

  enum Side {
    Long,
    Short
  }

  struct Ruleset {
    uint64 effectiveFrom;
    uint64 supersededAt; // 0 while no later ruleset has been committed
  }

  struct Evidence {
    bytes32 rulesetHash;
    uint64 stampedAt;
  }

  uint64 public immutable COOLDOWN;

  mapping(bytes32 rulesetHash => Ruleset) public rulesets;
  mapping(bytes32 bundleHash => Evidence) public evidence;
  bytes32 public latestRuleset;

  event RulesetCommitted(bytes32 indexed rulesetHash, uint64 effectiveFrom);
  event RulesetSuperseded(bytes32 indexed rulesetHash, uint64 supersededAt);
  event EvidenceStamped(
    bytes32 indexed bundleHash,
    bytes32 indexed rulesetHash,
    bytes32 indexed token,
    Side side,
    uint256 entryPriceE8,
    uint8 verifiedTweets,
    uint16 flags
  );

  error CooldownNotRespected(uint64 effectiveFrom, uint64 earliestAllowed);
  error RulesetAlreadyCommitted(bytes32 rulesetHash);
  error EffectiveFromNotAfterLatest(uint64 effectiveFrom, uint64 latestEffectiveFrom);
  error RulesetNotActive(bytes32 rulesetHash, uint64 at);
  error EvidenceAlreadyStamped(bytes32 bundleHash);

  constructor(address forwarder, uint64 cooldown) ReceiverTemplate(forwarder) {
    COOLDOWN = cooldown;
  }

  function isActive(bytes32 rulesetHash, uint64 at) public view returns (bool) {
    Ruleset memory r = rulesets[rulesetHash];
    if (r.effectiveFrom == 0 || at < r.effectiveFrom) return false;
    return r.supersededAt == 0 || at < r.supersededAt;
  }

  function _processReport(bytes calldata report) internal override {
    ReportKind kind = abi.decode(report[:32], (ReportKind));
    if (kind == ReportKind.CommitRuleset) {
      (, bytes32 rulesetHash, uint64 effectiveFrom) = abi.decode(report, (ReportKind, bytes32, uint64));
      _commitRuleset(rulesetHash, effectiveFrom);
    } else {
      _stampEvidence(report);
    }
  }

  function _commitRuleset(bytes32 rulesetHash, uint64 effectiveFrom) private {
    uint64 earliestAllowed = uint64(block.timestamp) + COOLDOWN;
    if (effectiveFrom < earliestAllowed) revert CooldownNotRespected(effectiveFrom, earliestAllowed);
    if (rulesets[rulesetHash].effectiveFrom != 0) revert RulesetAlreadyCommitted(rulesetHash);

    bytes32 previous = latestRuleset;
    if (previous != bytes32(0)) {
      uint64 latestEffectiveFrom = rulesets[previous].effectiveFrom;
      if (effectiveFrom <= latestEffectiveFrom) revert EffectiveFromNotAfterLatest(effectiveFrom, latestEffectiveFrom);
      rulesets[previous].supersededAt = effectiveFrom;
      emit RulesetSuperseded(previous, effectiveFrom);
    }

    rulesets[rulesetHash] = Ruleset({effectiveFrom: effectiveFrom, supersededAt: 0});
    latestRuleset = rulesetHash;
    emit RulesetCommitted(rulesetHash, effectiveFrom);
  }

  function _stampEvidence(bytes calldata report) private {
    (
      ,
      bytes32 bundleHash,
      bytes32 rulesetHash,
      bytes32 token,
      Side side,
      uint256 entryPriceE8,
      uint8 verifiedTweets,
      uint16 flags
    ) = abi.decode(report, (ReportKind, bytes32, bytes32, bytes32, Side, uint256, uint8, uint16));

    uint64 now_ = uint64(block.timestamp);
    if (!isActive(rulesetHash, now_)) revert RulesetNotActive(rulesetHash, now_);
    if (evidence[bundleHash].stampedAt != 0) revert EvidenceAlreadyStamped(bundleHash);

    evidence[bundleHash] = Evidence({rulesetHash: rulesetHash, stampedAt: now_});
    emit EvidenceStamped(bundleHash, rulesetHash, token, side, entryPriceE8, verifiedTweets, flags);
  }
}
