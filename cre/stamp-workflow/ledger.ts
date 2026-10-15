import { bytesToHex, EVMClient, getNetwork, hexToBase64, TxStatus, type Runtime } from "@chainlink/cre-sdk";
import { toEventSelector, type Hex } from "viem";
import type { Config } from "./config";

export const RULESET_COMMITTED = toEventSelector("RulesetCommitted(bytes32,uint64)");
export const EVIDENCE_STAMPED = toEventSelector(
  "EvidenceStamped(bytes32,bytes32,bytes32,uint8,uint256,uint8,uint16)",
);

// Mirrors capabilities.blockchain.evm.v1alpha.ReceiverContractExecutionStatus, which the
// SDK does not export for EVM.
const RECEIVER_REVERTED = 1;

type WriteResult = {
  txStatus: TxStatus;
  receiverContractExecutionStatus?: number;
  txHash?: Uint8Array;
  errorMessage?: string;
};

export function assertWriteSucceeded(result: WriteResult): string {
  if (result.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`Ledger write failed (tx status ${result.txStatus}): ${result.errorMessage ?? "no error message"}`);
  }
  if (result.receiverContractExecutionStatus === RECEIVER_REVERTED) {
    throw new Error(`Ledger rejected the report: ${result.errorMessage ?? "onReport reverted"}`);
  }
  return bytesToHex(result.txHash ?? new Uint8Array(32));
}

type LogLike = { address: string; topics: string[] };

export function assertLedgerEvent(logs: LogLike[], ledger: string, topic0: Hex, key: Hex): void {
  const found = logs.some(
    (log) =>
      log.address.toLowerCase() === ledger.toLowerCase() &&
      log.topics[0]?.toLowerCase() === topic0 &&
      log.topics[1]?.toLowerCase() === key.toLowerCase(),
  );
  if (!found) throw new Error(`Ledger did not record ${key}; onReport reverted (inactive ruleset, cooldown or duplicate)`);
}

function ledgerClient(runtime: Runtime<Config>): EVMClient {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName });
  if (!network) throw new Error(`Unknown chain ${runtime.config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
}

export function writeToLedger(runtime: Runtime<Config>, report: Hex): string {
  const signed = runtime
    .report({ encodedPayload: hexToBase64(report), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();

  // Explicit limit: under Sepolia's Glamsterdam gas model onReport alone needs ~251k,
  // and the default limit left it out of gas inside the forwarder (2026-10-15).
  const result = ledgerClient(runtime)
    .writeReport(runtime, {
      receiver: runtime.config.ledgerAddress,
      report: signed,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result();

  return assertWriteSucceeded(result);
}

// The forwarder swallows onReport reverts and the simulator still reports success, so
// every write is confirmed from its own receipt: the ledger's event must be in that tx.
// Looking the receipt up by hash avoids racing a node that has not seen the block yet.
export function confirmLedgerEvent(runtime: Runtime<Config>, txHash: string, topic0: Hex, key: Hex): void {
  const { receipt } = ledgerClient(runtime)
    .getTransactionReceipt(runtime, { hash: hexToBase64(txHash) })
    .result();
  if (!receipt) throw new Error(`No receipt for ${txHash}`);

  const logs = receipt.logs.map((log) => ({ address: bytesToHex(log.address), topics: log.topics.map(bytesToHex) }));
  assertLedgerEvent(logs, runtime.config.ledgerAddress, topic0, key);
}
