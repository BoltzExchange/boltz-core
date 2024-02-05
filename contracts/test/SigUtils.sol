// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

contract SigUtils {
    bytes32 immutable public DOMAIN_SEPARATOR;
    bytes32 immutable public TYPEHASH;

    constructor(bytes32 _DOMAIN_SEPARATOR, bytes32 _TYPEHASH) {
        DOMAIN_SEPARATOR = _DOMAIN_SEPARATOR;
        TYPEHASH = _TYPEHASH;
    }

    function getTypedDataHash(bytes32 message) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                message
            )
        );
    }

    function hashEtherSwapRefund(
        bytes32 preimageHash,
        uint amount,
        address claimAddress,
        uint timelock
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                preimageHash,
                amount,
                claimAddress,
                timelock
            )
        );
    }

    function hashERC20SwapRefund(
        bytes32 preimageHash,
        uint amount,
        address tokenAddress,
        address claimAddress,
        uint timelock
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                preimageHash,
                amount,
                tokenAddress,
                claimAddress,
                timelock
            )
        );
    }
}
