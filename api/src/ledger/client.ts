import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { sepolia } from "viem/chains";
import type { CommittedRulesetEvent, LedgerSource, StampedEvent } from "./reconcile";

const evidenceStamped = parseAbiItem(
  "event EvidenceStamped(bytes32 indexed bundleHash, bytes32 indexed rulesetHash, bytes32 indexed token, uint8 side, uint256 entryPriceE8, uint8 verifiedTweets, uint16 flags)",
);

const rulesetCommitted = parseAbiItem("event RulesetCommitted(bytes32 indexed rulesetHash, uint64 effectiveFrom)");

// Public RPCs cap eth_getLogs ranges; query in chunks.
const MAX_LOG_RANGE = 1_000n;

export function sepoliaLedger(rpcUrl: string, ledgerAddress: Hex): LedgerSource {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

  return {
    headBlock: () => client.getBlockNumber(),
    async stampedEvents(fromBlock, toBlock) {
      const events: StampedEvent[] = [];
      for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
        const end = start + MAX_LOG_RANGE - 1n < toBlock ? start + MAX_LOG_RANGE - 1n : toBlock;
        const logs = await client.getLogs({ address: ledgerAddress, event: evidenceStamped, fromBlock: start, toBlock: end });
        for (const log of logs) {
          events.push({
            bundleHash: log.args.bundleHash!,
            rulesetHash: log.args.rulesetHash!,
            token: log.args.token!,
            entryPriceE8: log.args.entryPriceE8!,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
      }
      return events;
    },
    async committedRulesets(fromBlock, toBlock) {
      const events: CommittedRulesetEvent[] = [];
      for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
        const end = start + MAX_LOG_RANGE - 1n < toBlock ? start + MAX_LOG_RANGE - 1n : toBlock;
        const logs = await client.getLogs({ address: ledgerAddress, event: rulesetCommitted, fromBlock: start, toBlock: end });
        events.push(...logs.map((log) => ({ rulesetHash: log.args.rulesetHash!, txHash: log.transactionHash })));
      }
      return events;
    },
  };
}
