// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 public tokenDecimals;

    constructor(string memory name, string memory symbol, uint8 initialDecimals, uint256 initialSupply) ERC20(name, symbol) {
        tokenDecimals = initialDecimals;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return tokenDecimals;
    }
}
