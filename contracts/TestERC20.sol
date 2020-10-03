// SPDX-License-Identifier: MIT

pragma solidity 0.7.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("TestERC20", "TER") {
        _mint(msg.sender, initialSupply);
    }
}
