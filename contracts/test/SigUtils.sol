// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

contract SigUtils {
    bytes32 public immutable DOMAIN_SEPARATOR;

    constructor(bytes32 domainSeparator) {
        DOMAIN_SEPARATOR = domainSeparator;
    }

    function getTypedDataHash(bytes32 message) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, message));
    }

    function hashEtherSwapClaim(
        bytes32 typehash,
        bytes32 preimage,
        uint256 amount,
        address refundAddress,
        uint256 timelock,
        address destination
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(typehash, preimage, amount, refundAddress, timelock, destination));
    }

    function hashEtherSwapRefund(
        bytes32 typehash,
        bytes32 preimageHash,
        uint256 amount,
        address claimAddress,
        uint256 timelock
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(typehash, preimageHash, amount, claimAddress, timelock));
    }

    function hashEtherSwapCommit(
        bytes32 typehash,
        bytes32 preimageHash,
        uint256 amount,
        address claimAddress,
        address refundAddress,
        uint256 timelock
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(typehash, preimageHash, amount, claimAddress, refundAddress, timelock));
    }

    function hashErc20SwapClaim(
        bytes32 typehash,
        bytes32 preimage,
        uint256 amount,
        address tokenAddress,
        address refundAddress,
        uint256 timelock,
        address destination
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(typehash, preimage, amount, tokenAddress, refundAddress, timelock, destination));
    }

    function hashErc20SwapRefund(
        bytes32 typehash,
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        uint256 timelock
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(typehash, preimageHash, amount, tokenAddress, claimAddress, timelock));
    }

    function hashErc20SwapCommit(
        bytes32 typehash,
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint256 timelock
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(typehash, preimageHash, amount, tokenAddress, claimAddress, refundAddress, timelock)
        );
    }
}
