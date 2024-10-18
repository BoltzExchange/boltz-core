// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../EtherSwap.sol";
import "../ERC20Swap.sol";
import "../TestERC20.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        console.log("Deployed EtherSwap: ", address(new EtherSwap()));
        console.log("Deployed ERC20Swap: ", address(new ERC20Swap()));

        uint8 decimals = 18;
        TestERC20 erc20 = new TestERC20("TestERC20", "TRC20", decimals, 1000 * (10 ** decimals));

        console.log("Deployed TestERC20: ", address(erc20));
    }
}
