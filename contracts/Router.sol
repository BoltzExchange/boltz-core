// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {TransferHelper} from "./TransferHelper.sol";
import {EtherSwap} from "./EtherSwap.sol";
import {ERC20Swap} from "./ERC20Swap.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Router
/// @dev A contract that enables atomic claiming from EtherSwap and ERC20Swap contracts followed by arbitrary call execution and fund sweeping.
/// This allows users to claim their funds and immediately use them in other operations like DEX trades, all in a single transaction.
contract Router is ReentrancyGuard {
    using SafeERC20 for IERC20;

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

    /// @dev Struct containing all parameters needed to claim from an ERC20Swap contract
    /// @param preimage The preimage that unlocks the swap
    /// @param amount The amount of tokens locked in the swap
    /// @param tokenAddress The address of the ERC20 token locked in the swap
    /// @param refundAddress The address that can claim a refund after timelock expires
    /// @param timelock The timestamp after which a refund becomes possible
    /// @param v Final byte of the signature
    /// @param r Second 32 bytes of the signature
    /// @param s First 32 bytes of the signature
    struct Erc20Claim {
        bytes32 preimage;
        uint256 amount;
        address tokenAddress;
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

    /// @dev Thrown when a call targets a swap contract
    error SwapCallNotAllowed();

    /// @dev Thrown when the sweep amount is greater than the contract balance
    error InsufficientBalance();

    /// @dev Thrown when the token address doesn't match the permit token
    error TokenMismatch();

    /// @dev Version of the contract used for compatibility checks
    uint8 public constant VERSION = 2;

    bytes32 public constant TYPEHASH_CLAIM =
        keccak256("Claim(bytes32 preimage,address token,uint256 minAmountOut,address destination)");
    bytes32 public constant TYPEHASH_CLAIM_CALL =
        keccak256("ClaimCall(bytes32 preimage,address callee,bytes32 callData)");
    bytes32 public constant TYPEHASH_EXECUTE_LOCK_ERC20 = keccak256(
        "ExecuteAndLockERC20(bytes32 preimageHash,address token,address claimAddress,address refundAddress,uint256 timelock,bytes32 callsHash)"
    );
    string public constant TYPESTRING_EXECUTE_LOCK_ERC20 =
        "ExecuteAndLockERC20 witness)ExecuteAndLockERC20(bytes32 preimageHash,address token,address claimAddress,address refundAddress,uint256 timelock,bytes32 callsHash)TokenPermissions(address token,uint256 amount)";

    /// @dev The EtherSwap contract instance this router interacts with
    EtherSwap public immutable SWAP_CONTRACT;

    /// @dev The ERC20Swap contract instance this router interacts with
    ERC20Swap public immutable ERC20_SWAP_CONTRACT;

    /// @dev The Permit2 contract instance used for signature transfers
    ISignatureTransfer public immutable PERMIT2;

    bytes32 public immutable DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Router"),
            keccak256("2"),
            block.chainid,
            address(this)
        )
    );

    /// @dev Constructor sets the EtherSwap and ERC20Swap contract addresses
    /// @param swapContract The address of the EtherSwap contract to interact with
    /// @param erc20SwapContract The address of the ERC20Swap contract to interact with
    /// @param permit2Contract The address of the Permit2 contract to interact with
    constructor(address swapContract, address erc20SwapContract, address permit2Contract) {
        SWAP_CONTRACT = EtherSwap(payable(swapContract));
        ERC20_SWAP_CONTRACT = ERC20Swap(erc20SwapContract);
        PERMIT2 = ISignatureTransfer(permit2Contract);
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
    function claimExecute(Claim calldata claim, Call[] calldata calls, address token, uint256 minAmountOut)
        external
        nonReentrant
    {
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
    ) external nonReentrant {
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
    function claimCall(Claim calldata claim, address callee, bytes calldata callData) external nonReentrant {
        if (claimSwap(claim) != msg.sender) {
            revert ClaimInvalidAddress();
        }

        revertIfRestrictedTarget(callee);

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
        nonReentrant
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

        revertIfRestrictedTarget(callee);

        (bool success,) = callee.call{value: claim.amount}(callData);
        if (!success) {
            revert CallFailed(0);
        }
    }

    /// @dev Claims tokens from the ERC20Swap contract, executes arbitrary calls, then sweeps remaining funds
    /// @param claim The claim parameters for the ERC20Swap contract
    /// @param calls Array of arbitrary calls to execute after claiming
    /// @param token The token address to sweep (address(0) for Ether)
    /// @param minAmountOut The amount to sweep to the claimer
    //
    // Flow:
    // 1. Claim tokens from the ERC20Swap contract
    // 2. Verify the claimer is the transaction sender
    // 3. Execute all provided calls in sequence
    // 4. Sweep remaining funds (Ether or tokens) to the claimer
    function claimERC20Execute(Erc20Claim calldata claim, Call[] calldata calls, address token, uint256 minAmountOut)
        external
        nonReentrant
    {
        // Ensure only the rightful claimer can execute this function
        if (claimERC20Swap(claim) != msg.sender) {
            revert ClaimInvalidAddress();
        }

        executeCalls(calls);
        sweep(msg.sender, token, minAmountOut);
    }

    /// @dev Claims tokens from the ERC20Swap contract, executes arbitrary calls, then sweeps remaining funds to a specified destination
    /// This version uses EIP-712 signature verification to allow the claimer to authorize someone else to execute the claim
    /// @param claim The claim parameters for the ERC20Swap contract
    /// @param calls Array of arbitrary calls to execute after claiming
    /// @param token The token address to sweep (address(0) for Ether)
    /// @param minAmountOut The amount to sweep to the destination
    /// @param destination The address where the swept funds will be sent
    /// @param v Final byte of the signature
    /// @param r Second 32 bytes of the signature
    /// @param s First 32 bytes of the signature
    //
    // Flow:
    // 1. Claim tokens from the ERC20Swap contract
    // 2. Verify the claimer has authorized this execution via EIP-712 signature
    // 3. Execute all provided calls in sequence
    // 4. Sweep remaining funds (Ether or tokens) to the specified destination
    function claimERC20Execute(
        Erc20Claim calldata claim,
        Call[] calldata calls,
        address token,
        uint256 minAmountOut,
        address destination,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // Verify that the claimer has signed authorization for this specific execution
        // The signature covers: preimage, token, minAmountOut, and destination
        if (
            claimERC20Swap(claim)
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

    /// @dev Claims tokens from the ERC20Swap contract and performs a single external call
    /// @notice This function does not sweep remaining funds to the claimer, so ensure that the callee consumes all tokens
    /// @param claim The claim parameters for the ERC20Swap contract
    /// @param callee The contract address to call after claiming
    /// @param callData The encoded function calldata for the call
    //
    // Flow:
    // 1. Claim tokens from the ERC20Swap contract
    // 2. Verify the claimer is the transaction sender
    // 3. Approve the callee to spend the claimed tokens
    // 4. Call the provided callee
    function claimERC20Call(Erc20Claim calldata claim, address callee, bytes calldata callData) external nonReentrant {
        if (claimERC20Swap(claim) != msg.sender) {
            revert ClaimInvalidAddress();
        }

        revertIfRestrictedTarget(callee);

        // Approve the callee to spend the claimed tokens
        IERC20(claim.tokenAddress).forceApprove(callee, claim.amount);

        (bool success,) = callee.call(callData);
        if (!success) {
            revert CallFailed(0);
        }
    }

    /// @dev Claims tokens from the ERC20Swap contract and performs a single external call, authorized via EIP-712 signature
    /// @notice This function does not sweep remaining funds to the claimer, so ensure that the callee consumes all tokens
    /// @param claim The claim parameters for the ERC20Swap contract
    /// @param callee The contract address to call after claiming
    /// @param callData The encoded function calldata for the call
    /// @param v Final byte of the EIP-712 signature authorizing this call
    /// @param r Second 32 bytes of the EIP-712 signature authorizing this call
    /// @param s First 32 bytes of the EIP-712 signature authorizing this call
    //
    // Flow:
    // 1. Claim tokens from the ERC20Swap contract
    // 2. Verify the claimer has authorized this call via EIP-712 signature
    // 3. Approve the callee to spend the claimed tokens
    // 4. Call the provided callee
    function claimERC20Call(
        Erc20Claim calldata claim,
        address callee,
        bytes calldata callData,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // Verify that the claimer has signed authorization for this specific call
        if (
            claimERC20Swap(claim)
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

        revertIfRestrictedTarget(callee);

        // Approve the callee to spend the claimed tokens
        IERC20(claim.tokenAddress).forceApprove(callee, claim.amount);

        (bool success,) = callee.call(callData);
        if (!success) {
            revert CallFailed(0);
        }
    }

    /// @dev Executes arbitrary calls, then locks the remaining Ether balance in the swap contract
    /// @param preimageHash The preimage hash for the swap
    /// @param claimAddress The address that can claim the locked Ether
    /// @param refundAddress The address that can refund the locked Ether
    /// @param timelock The block height after which a refund becomes possible
    /// @param calls Array of arbitrary calls to execute before locking
    function executeAndLock(
        bytes32 preimageHash,
        address claimAddress,
        address refundAddress,
        uint256 timelock,
        Call[] calldata calls
    ) external payable nonReentrant {
        executeCalls(calls);
        SWAP_CONTRACT.lock{value: address(this).balance}(preimageHash, claimAddress, refundAddress, timelock);
    }

    /// @dev Executes arbitrary calls, then locks the remaining token balance in the swap contract
    /// @param preimageHash The preimage hash for the swap
    /// @param tokenAddress The ERC20 token address to lock
    /// @param claimAddress The address that can claim the locked tokens
    /// @param refundAddress The address that can refund the locked tokens
    /// @param timelock The block height after which a refund becomes possible
    /// @param calls Array of arbitrary calls to execute before locking
    function executeAndLockERC20(
        bytes32 preimageHash,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint256 timelock,
        Call[] calldata calls
    ) external payable nonReentrant {
        executeCalls(calls);
        lockErc20FromBalance(preimageHash, tokenAddress, claimAddress, refundAddress, timelock);
    }

    /// @dev Executes arbitrary calls, transfers tokens via Permit2, then locks the remaining token balance
    /// @param preimageHash The preimage hash for the swap
    /// @param tokenAddress The ERC20 token address to lock
    /// @param claimAddress The address that can claim the locked tokens
    /// @param refundAddress The address that can refund the locked tokens
    /// @param timelock The block height after which a refund becomes possible
    /// @param calls Array of arbitrary calls to execute before locking
    /// @param permit Permit2 transfer permit signed by the token owner
    /// @param signature Signature over the Permit2 transfer permit and witness data
    function executeAndLockERC20WithPermit2(
        bytes32 preimageHash,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint256 timelock,
        Call[] calldata calls,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external payable nonReentrant {
        bytes32 callsHash;
        {
            bytes memory callsData = abi.encode(calls);
            assembly ("memory-safe") {
                callsHash := keccak256(add(callsData, 0x20), mload(callsData))
            }
        }

        permit2Transfer(tokenAddress, preimageHash, claimAddress, refundAddress, timelock, callsHash, permit, signature);
        executeCalls(calls);
        lockErc20FromBalance(preimageHash, tokenAddress, claimAddress, refundAddress, timelock);
    }

    function lockErc20FromBalance(
        bytes32 preimageHash,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint256 timelock
    ) internal {
        IERC20 token = IERC20(tokenAddress);
        uint256 amount = token.balanceOf(address(this));
        token.forceApprove(address(ERC20_SWAP_CONTRACT), amount);
        ERC20_SWAP_CONTRACT.lock(preimageHash, amount, tokenAddress, claimAddress, refundAddress, timelock);
    }

    function permit2Transfer(
        address tokenAddress,
        bytes32 preimageHash,
        address claimAddress,
        address refundAddress,
        uint256 timelock,
        bytes32 callsHash,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) internal {
        if (tokenAddress != permit.permitted.token) {
            revert TokenMismatch();
        }

        bytes32 witness;
        {
            bytes32 typeHash = TYPEHASH_EXECUTE_LOCK_ERC20;
            assembly ("memory-safe") {
                let ptr := mload(0x40)
                mstore(ptr, typeHash)
                mstore(add(ptr, 0x20), preimageHash)
                mstore(add(ptr, 0x40), tokenAddress)
                mstore(add(ptr, 0x60), claimAddress)
                mstore(add(ptr, 0x80), refundAddress)
                mstore(add(ptr, 0xa0), timelock)
                mstore(add(ptr, 0xc0), callsHash)
                witness := keccak256(ptr, 0xe0)
                mstore(0x40, add(ptr, 0xe0))
            }
        }

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            refundAddress,
            witness,
            TYPESTRING_EXECUTE_LOCK_ERC20,
            signature
        );
    }

    function claimSwap(Claim calldata claim) internal returns (address) {
        return SWAP_CONTRACT.claim(
            claim.preimage, claim.amount, claim.refundAddress, claim.timelock, claim.v, claim.r, claim.s
        );
    }

    function claimERC20Swap(Erc20Claim calldata claim) internal returns (address) {
        return ERC20_SWAP_CONTRACT.claim(
            claim.preimage,
            claim.amount,
            claim.tokenAddress,
            claim.refundAddress,
            claim.timelock,
            claim.v,
            claim.r,
            claim.s
        );
    }

    function revertIfRestrictedTarget(address target) internal view {
        if (target == address(SWAP_CONTRACT) || target == address(ERC20_SWAP_CONTRACT) || target == address(PERMIT2)) {
            revert SwapCallNotAllowed();
        }
    }

    function executeCalls(Call[] calldata calls) internal {
        uint256 length = calls.length;
        Call calldata c;

        for (uint256 i = 0; i < length; ++i) {
            c = calls[i];

            revertIfRestrictedTarget(c.target);

            // Execute the call and revert if it fails
            (bool success,) = c.target.call{value: c.value}(c.callData);
            if (!success) {
                revert CallFailed(i);
            }
        }
    }

    function sweep(address destination, address token, uint256 minAmountOut) internal {
        uint256 balance;
        bool isEther = token == address(0);

        if (isEther) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }

        if (balance < minAmountOut) {
            revert InsufficientBalance();
        }

        if (isEther) {
            TransferHelper.transferEther(payable(destination), balance);
        } else {
            TransferHelper.safeTransferToken(token, destination, balance);
        }
    }

    /// @dev Allows the contract to receive Ether
    receive() external payable {}
}
