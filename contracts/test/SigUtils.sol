// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

contract SigUtils {
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public immutable TYPEHASH;

    constructor(bytes32 _DOMAIN_SEPARATOR, bytes32 _TYPEHASH) {
        DOMAIN_SEPARATOR = _DOMAIN_SEPARATOR;
        TYPEHASH = _TYPEHASH;
    }

    function getTypedDataHash(bytes32 message) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, message));
    }

    function hashEtherSwapRefund(bytes32 preimageHash, uint256 amount, address claimAddress, uint256 timelock)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(TYPEHASH, preimageHash, amount, claimAddress, timelock));
    }

    function hashERC20SwapRefund(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        uint256 timelock
    ) public view returns (bytes32) {
        return keccak256(abi.encode(TYPEHASH, preimageHash, amount, tokenAddress, claimAddress, timelock));
    }
}
