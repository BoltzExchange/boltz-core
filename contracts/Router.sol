// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {TransferHelper} from "./TransferHelper.sol";
import {EtherSwap} from "./EtherSwap.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Router
/// @dev A contract that enables atomic claiming from EtherSwap contracts followed by arbitrary call execution and fund sweeping.
/// This allows users to claim their funds and immediately use them in other operations like DEX trades, all in a single transaction.
contract Router {
    /// @dev Struct containing all parameters needed to claim from an EtherSwap contract
    /// @param preimage The preimage that unlocks the swap
    /// @param amount The amount of Ether locked in the swap
    /// @param refundAddress The address that can claim a refund after timelock expires
    /// @param timelock The timestamp after which a refund becomes possible
    /// @param v Final byte of the signature
    /// @param r Second 32 bytes of the signature
    /// @param s First 32 bytes of the signature
    struct Claim {
        bytes32 preimage;
        uint256 amount;
        address refundAddress;
        uint256 timelock;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Struct representing an arbitrary contract call to be executed
    /// @param target The contract address to call
    /// @param value The amount of Ether to send with the call
    /// @param callData The encoded function calldata
    struct Call {
        address target;
        uint256 value;
        bytes callData;
    }

    /// @dev Thrown when the claimer address doesn't match the transaction sender
    error ClaimInvalidAddress();

    /// @dev Thrown when one of the arbitrary calls fails
    /// @param index The index of the failed call in the calls array
    error CallFailed(uint256 index);

    /// @dev Thrown when the sweep amount is greater than the contract balance
    error InsufficientBalance();

    /// @dev Version of the contract used for compatibility checks
    uint8 public constant VERSION = 1;

    bytes32 public constant TYPEHASH_CLAIM =
        keccak256("Claim(bytes32 preimage,address token,uint256 minAmountOut,address destination)");
    bytes32 public constant TYPEHASH_CLAIM_CALL =
        keccak256("ClaimCall(bytes32 preimage,address callee,bytes32 callData)");

    /// @dev The EtherSwap contract instance this router interacts with
    EtherSwap public immutable SWAP_CONTRACT;

    bytes32 public immutable DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Router"),
            keccak256("1"),
            block.chainid,
            address(this)
        )
    );

    /// @dev Constructor sets the EtherSwap contract address
    /// @param swapContract The address of the EtherSwap contract to interact with
    constructor(address swapContract) {
        SWAP_CONTRACT = EtherSwap(payable(swapContract));
    }

    /// @dev Claims funds from the swap contract, executes arbitrary calls, then sweeps remaining funds
    /// @param claim The claim parameters for the EtherSwap contract
    /// @param calls Array of arbitrary calls to execute after claiming
    /// @param token The token address to sweep (address(0) for Ether)
    /// @param minAmountOut The amount to sweep to the claimer
    //
    // Flow:
    // 1. Claim funds from the EtherSwap contract
    // 2. Verify the claimer is the transaction sender
    // 3. Execute all provided calls in sequence
    // 4. Sweep remaining funds (Ether or tokens) to the claimer
    function claimExecute(Claim calldata claim, Call[] calldata calls, address token, uint256 minAmountOut) external {
        // Ensure only the rightful claimer can execute this function
        if (claimSwap(claim) != msg.sender) {
            revert ClaimInvalidAddress();
        }

        executeCalls(calls);
        sweep(msg.sender, token, minAmountOut);
    }

    /// @dev Claims funds from the swap contract, executes arbitrary calls, then sweeps remaining funds to a specified destination
    /// This version uses EIP-712 signature verification to allow the claimer to authorize someone else to execute the claim
    /// @param claim The claim parameters for the EtherSwap contract
    /// @param calls Array of arbitrary calls to execute after claiming
    /// @param token The token address to sweep (address(0) for Ether)
    /// @param minAmountOut The amount to sweep to the destination
    /// @param destination The address where the swept funds will be sent
    /// @param v Final byte of the signature
    /// @param r Second 32 bytes of the signature
    /// @param s First 32 bytes of the signature
    //
    // Flow:
    // 1. Claim funds from the EtherSwap contract
    // 2. Verify the claimer has authorized this execution via EIP-712 signature
    // 3. Execute all provided calls in sequence
    // 4. Sweep remaining funds (Ether or tokens) to the specified destination
    function claimExecute(
        Claim calldata claim,
        Call[] calldata calls,
        address token,
        uint256 minAmountOut,
        address destination,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Verify that the claimer has signed authorization for this specific execution
        // The signature covers: preimage, token, minAmountOut, and destination
        if (
            claimSwap(claim)
                != ecrecover(
                    keccak256(
                        abi.encodePacked(
                            "\x19\x01",
                            DOMAIN_SEPARATOR,
                            keccak256(abi.encode(TYPEHASH_CLAIM, claim.preimage, token, minAmountOut, destination))
                        )
                    ),
                    v,
                    r,
                    s
                )
        ) {
            revert ClaimInvalidAddress();
        }

        executeCalls(calls);
        sweep(destination, token, minAmountOut);
    }

    /// @dev Claims funds from the EtherSwap contract and performs a single external call forwarding the claimed Ether
    /// @param claim The claim parameters for the EtherSwap contract
    /// @param callee The contract address to call after claiming
    /// @param callData The encoded function calldata for the call
    //
    // Flow:
    // 1. Claim funds from the EtherSwap contract
    // 2. Verify the claimer is the transaction sender
    // 3. Call the provided callee with `claim.amount` as value
    function claimCall(Claim calldata claim, address callee, bytes calldata callData) external {
        if (claimSwap(claim) != msg.sender) {
            revert ClaimInvalidAddress();
        }

        (bool success,) = callee.call{value: claim.amount}(callData);
        if (!success) {
            revert CallFailed(0);
        }
    }

    /// @dev Claims funds from the EtherSwap contract and performs a single external call, authorized via EIP-712 signature
    /// @param claim The claim parameters for the EtherSwap contract
    /// @param callee The contract address to call after claiming
    /// @param callData The encoded function calldata for the call
    /// @param v Final byte of the EIP-712 signature authorizing this call
    /// @param r Second 32 bytes of the EIP-712 signature authorizing this call
    /// @param s First 32 bytes of the EIP-712 signature authorizing this call
    //
    // Flow:
    // 1. Claim funds from the EtherSwap contract
    // 2. Verify the claimer has authorized this call via EIP-712 signature
    // 3. Call the provided callee with `claim.amount` as value
    function claimCall(Claim calldata claim, address callee, bytes calldata callData, uint8 v, bytes32 r, bytes32 s)
        external
    {
        // Verify that the claimer has signed authorization for this specific call
        if (
            claimSwap(claim)
                != ecrecover(
                    keccak256(
                        abi.encodePacked(
                            "\x19\x01",
                            DOMAIN_SEPARATOR,
                            keccak256(abi.encode(TYPEHASH_CLAIM_CALL, claim.preimage, callee, keccak256(callData)))
                        )
                    ),
                    v,
                    r,
                    s
                )
        ) {
            revert ClaimInvalidAddress();
        }

        (bool success,) = callee.call{value: claim.amount}(callData);
        if (!success) {
            revert CallFailed(0);
        }
    }

    function claimSwap(Claim calldata claim) internal returns (address) {
        return SWAP_CONTRACT.claim(
            claim.preimage, claim.amount, claim.refundAddress, claim.timelock, claim.v, claim.r, claim.s
        );
    }

    function executeCalls(Call[] calldata calls) internal {
        uint256 length = calls.length;
        Call calldata c;

        for (uint256 i = 0; i < length; i++) {
            c = calls[i];

            // Execute the call and revert if it fails
            (bool success,) = c.target.call{value: c.value}(c.callData);
            if (!success) {
                revert CallFailed(i);
            }
        }
    }

    function sweep(address destination, address token, uint256 minAmountOut) internal {
        uint256 balance = 0;

        if (token == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }

        if (balance < minAmountOut) {
            revert InsufficientBalance();
        }

        if (token == address(0)) {
            TransferHelper.transferEther(payable(destination), balance);
        } else {
            TransferHelper.safeTransferToken(token, destination, balance);
        }
    }

    /// @dev Allows the contract to receive Ether
    receive() external payable {}
}
