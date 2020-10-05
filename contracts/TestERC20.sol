// SPDX-License-Identifier: MIT

pragma solidity 0.7.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals, uint256 initialSupply) ERC20(name, symbol) {
        _setupDecimals(decimals);
        _mint(msg.sender, initialSupply);
    }
}
