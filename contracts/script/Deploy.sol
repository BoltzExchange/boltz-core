// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {EtherSwap} from "../EtherSwap.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
import {TestERC20} from "../TestERC20.sol";
import {Router} from "../Router.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        address etherSwapAddress = address(new EtherSwap());
        console.log("Deployed EtherSwap: ", etherSwapAddress);
        console.log("Deployed ERC20Swap: ", address(new ERC20Swap()));

        uint8 decimals = 18;
        TestERC20 erc20 = new TestERC20("TestERC20", "TRC20", decimals, 1000 * (10 ** decimals));

        console.log("Deployed Router: ", address(new Router(etherSwapAddress)));

        vm.stopBroadcast();

        console.log("Deployed TestERC20: ", address(erc20));
    }
}
