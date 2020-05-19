pragma solidity 0.6.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("TestERC20", "TER") public {
        _mint(msg.sender, initialSupply);
    }
}
