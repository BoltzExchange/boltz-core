// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {ERC20Swap} from "./ERC20Swap.sol";

// @title Hash timelock contract for ERC20 tokens using block timestamps for timeouts
contract ERC20SwapTimestamp is ERC20Swap {
    constructor(address initialOwner) ERC20Swap(initialOwner) {}

    function currentTime() internal view override returns (uint256) {
        return block.timestamp;
    }
}
