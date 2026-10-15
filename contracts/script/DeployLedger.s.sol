// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {HypestampLedger} from "../src/HypestampLedger.sol";

/// @notice Deploys HypestampLedger.
/// @dev FORWARDER defaults to the Sepolia MockKeystoneForwarder used by `cre workflow simulate --broadcast`.
///      Switch to the production forwarder (0xF8344CFd5c43616a4366C34E3EEE75af79a74482) with
///      setForwarderAddress once the workflow is deployed to the DON. COOLDOWN defaults to 1 hour for the demo.
contract DeployLedger is Script {
    address internal constant SEPOLIA_MOCK_FORWARDER =
        0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external returns (HypestampLedger ledger) {
        address forwarder = vm.envOr("FORWARDER", SEPOLIA_MOCK_FORWARDER);
        uint64 cooldown = uint64(vm.envOr("COOLDOWN", uint256(1 hours)));

        vm.startBroadcast();
        ledger = new HypestampLedger(forwarder, cooldown);
        vm.stopBroadcast();

        console.log("HypestampLedger:", address(ledger));
        console.log("forwarder:", forwarder);
        console.log("cooldown (s):", cooldown);
    }
}
