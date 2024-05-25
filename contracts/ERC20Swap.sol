// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "./TransferHelper.sol";

// @title Hash timelock contract for ERC20 tokens
contract ERC20Swap {
    // Constants

    /// @dev Version of the contract used for compatibility checks
    uint8 constant public version = 3;

    bytes32 immutable public DOMAIN_SEPARATOR;
    bytes32 immutable public TYPEHASH_REFUND;

    // State variables

    /// @dev Mapping between value hashes of swaps and whether they have Ether locked in the contract
    mapping (bytes32 => bool) public swaps;

    // Events

    event Lockup(
        bytes32 indexed preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address indexed refundAddress,
        uint timelock
    );

    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);

    // Functions

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ERC20Swap"),
                keccak256("3"),
                block.chainid,
                address(this)
            )
        );
        TYPEHASH_REFUND = keccak256(
            "Refund(bytes32 preimageHash,uint256 amount,address tokenAddress,address claimAddress,uint256 timeout)"
        );
    }

    // External functions

    /// Locks tokens for a swap in the contract and forwards a specified amount of Ether to the claim address
    /// @notice The amount of Ether forwarded to the claim address is the amount sent in the transaction and the refund address is the sender of the transaction
    /// @dev Make sure to set a reasonable gas limit for calling this function, else a malicious contract at the claim address could drain your Ether
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount that should be locked in the contract in the smallest denomination of the token
    /// @param tokenAddress Address of the token that should be locked in the contract
    /// @param claimAddress Address that can claim the locked tokens
    /// @param timelock Block height after which the locked tokens can be refunded
    function lockPrepayMinerfee(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address payable claimAddress,
        uint timelock
    ) external payable {
        lock(preimageHash, amount, tokenAddress, claimAddress, timelock);

        // Forward the amount of Ether sent in the transaction to the claim address
        TransferHelper.transferEther(claimAddress, msg.value);
    }

    /// Claims tokens locked in the contract
    /// @dev To query the arguments of this function, get the "Lockup" event logs for the SHA256 hash of the preimage
    /// @param preimage Preimage of the swap
    /// @param amount Amount locked in the contract for the swap in the smallest denomination of the token
    /// @param tokenAddress Address of the token locked for the swap
    /// @param refundAddress Address that locked the tokens in the contract
    /// @param timelock Block height after which the locked tokens can be refunded
    function claim(
        bytes32 preimage,
        uint amount,
        address tokenAddress,
        address refundAddress,
        uint timelock
    ) external {
        // Passing "msg.sender" as "claimAddress" to "hashValues" ensures that only the destined address can claim
        // All other addresses would produce a different hash for which no swap can be found in the "swaps" mapping
        claim(preimage, amount, tokenAddress, msg.sender, refundAddress, timelock);
    }

    /// Claims Ether locked in the contract for a specified claim address
    /// @dev To query the arguments of this function, get the "Lockup" event logs for the SHA256 hash of the preimage
    /// @param preimage Preimage of the swap
    /// @param amount Amount locked in the contract for the swap in the smallest denomination of the token
    /// @param tokenAddress Address of the token locked for the swap
    /// @param claimAddress Address to which the claimed funds will be sent
    /// @param refundAddress Address that locked the tokens in the contract
    /// @param timelock Block height after which the locked tokens can be refunded
    function claim(
        bytes32 preimage,
        uint amount,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint timelock
    ) public {
        // If the preimage is wrong, so will be its hash which will result in a wrong value hash and no swap being found
        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        bytes32 hash = hashValues(
            preimageHash,
            amount,
            tokenAddress,
            claimAddress,
            refundAddress,
            timelock
        );

        // Make sure that the swap to be claimed has tokens locked
        checkSwapIsLocked(hash);

        // Delete the swap from the mapping to ensure that it cannot be claimed or refunded anymore
        // This *HAS* to be done before actually sending the tokens to avoid reentrancy
        // Reentrancy is a bigger problem when sending Ether but there is no real downside to deleting from the mapping first
        delete swaps[hash];

        // Emit the "Claim" event
        emit Claim(preimageHash, preimage);

        // Transfer the tokens to the claim address
        TransferHelper.safeTransferToken(tokenAddress, claimAddress, amount);
    }

    /// Refunds tokens locked in the contract after the timeout
    /// @dev To query the arguments of this function, get the "Lockup" event logs for your refund address and the preimage hash if you have it
    /// @dev For further explanations and reasoning behind the statements in this function, check the "claim" function
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount locked in the contract for the swap in the smallest denomination of the token
    /// @param tokenAddress Address of the token locked for the swap
    /// @param claimAddress Address that that was destined to claim the funds
    /// @param timelock Block height after which the locked Ether can be refunded
    function refund(
        bytes32 preimageHash,
        uint amount,
        address tokenAddress,
        address claimAddress,
        uint timelock
    ) external {
        // Make sure the timelock has expired already
        // If the timelock is wrong, so will be the value hash of the swap which results in no swap being found
        require(timelock <= block.number, "ERC20Swap: swap has not timed out yet");
        refundInternal(preimageHash, amount, tokenAddress, claimAddress, timelock);
    }

    /// Refunds tokens locked in the contract with an EIP-712 signature of the claimAddress
    /// @dev To query the arguments of this function, get the "Lockup" event logs for your refund address and the preimage hash if you have it
    /// @dev For further explanations and reasoning behind the statements in this function, check the "claim" function
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount locked in the contract for the swap in the smallest denomination of the token
    /// @param tokenAddress Address of the token locked for the swap
    /// @param claimAddress Address that that was destined to claim the funds
    /// @param timelock Block height after which the locked Ether can be refunded
    /// @param v final byte of the signature
    /// @param r second 32 bytes of the signature
    /// @param s first 32 bytes of the signature
    function refundCooperative(
        bytes32 preimageHash,
        uint amount,
        address tokenAddress,
        address claimAddress,
        uint timelock,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        address recoveredAddress = ecrecover(
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            TYPEHASH_REFUND,
                            preimageHash,
                            amount,
                            tokenAddress,
                            claimAddress,
                            timelock
                        )
                    )
                )
            ),
            v,
            r,
            s
        );
        require(recoveredAddress != address(0) && recoveredAddress == claimAddress, "ERC20Swap: invalid signature");

        refundInternal(preimageHash, amount, tokenAddress, claimAddress, timelock);
    }

    // Public functions

    /// Locks tokens in the contract
    /// @notice The refund address is the sender of the transaction
    /// @dev This function is "public" so that it can be called from the outside and "lockPrepayMinerfee" function
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount to be locked in the contract
    /// @param tokenAddress Address of the token to be locked
    /// @param claimAddress Address that can claim the locked tokens
    /// @param timelock Block height after which the locked tokens can be refunded
    function lock(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        uint timelock
    ) public {
        // Locking zero tokens in the contract is pointless
        require(amount > 0, "ERC20Swap: locked amount must not be zero");

        // Transfer the specified amount of tokens from the sender of the transaction to the contract
        TransferHelper.safeTransferTokenFrom(tokenAddress, msg.sender, address(this), amount);

        // Hash the values of the swap
        bytes32 hash = hashValues(
            preimageHash,
            amount,
            tokenAddress,
            claimAddress,
            msg.sender,
            timelock
        );

        // Make sure no swap with this value hash exists yet
        require(swaps[hash] == false, "ERC20Swap: swap exists already");

        // Save to the state that funds were locked for this swap
        swaps[hash] = true;

        // Emit the "Lockup" event
        emit Lockup(preimageHash, amount, tokenAddress, claimAddress, msg.sender, timelock);
    }

    /// Hashes all the values of a swap with Keccak256
    /// @param preimageHash Preimage hash of the swap
    /// @param amount Amount the swap has locked in the smallest denomination of the token
    /// @param tokenAddress Address of the token of the swap
    /// @param claimAddress Address that can claim the locked tokens
    /// @param refundAddress Address that locked the tokens and can refund them
    /// @param timelock Block height after which the locked tokens can be refunded
    /// @return Value hash of the swap
    function hashValues(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint timelock
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            preimageHash,
            amount,
            tokenAddress,
            claimAddress,
            refundAddress,
            timelock
        ));
    }

    // Private functions

    function refundInternal(
        bytes32 preimageHash,
        uint amount,
        address tokenAddress,
        address claimAddress,
        uint timelock
    ) private {
        bytes32 hash = hashValues(
            preimageHash,
            amount,
            tokenAddress,
            claimAddress,
            msg.sender,
            timelock
        );

        checkSwapIsLocked(hash);
        delete swaps[hash];

        emit Refund(preimageHash);

        TransferHelper.safeTransferToken(tokenAddress, msg.sender, amount);
    }

    /// Checks whether a swap has tokens locked in the contract
    /// @dev This function reverts if the swap has no tokens locked in the contract
    /// @param hash Value hash of the swap
    function checkSwapIsLocked(bytes32 hash) private view {
        require(swaps[hash] == true, "ERC20Swap: swap has no tokens locked in the contract");
    }
}
