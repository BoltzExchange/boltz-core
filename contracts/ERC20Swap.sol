// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.6.11;

// Copyright 2020 Uniswap team
library TransferHelper {
    function safeTransfer(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "ERC20Swap: could not transfer ERC20 tokens"
        );
    }

    function safeTransferFrom(address token, address from, address to, uint value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "ERC20Swap: could not transfer ERC20 tokens"
        );
    }
}

contract ERC20Swap {
    uint8 constant public version = 1;

    struct Swap {
        uint256 amount;
        address tokenAddress;

        address claimAddress;
        address refundAddress;

        uint timelock;
    }

    mapping (bytes32 => Swap) public swaps;

    event Lockup(bytes32 indexed preimageHash);

    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);

    function checkSwapExists(bytes32 preimageHash) private view {
        require(swaps[preimageHash].amount != 0, "ERC20Swap: no swap with preimage hash");
    }

    modifier onlyPendingSwaps(bytes32 preimageHash) {
        checkSwapExists(preimageHash);
        _;
    }

    function lock(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        uint timelock
    ) external {
        require(amount > 0, "ERC20Swap: amount must not be zero");
        require(swaps[preimageHash].amount == 0, "ERC20Swap: swap with preimage hash exists already");

        // Transfer the requested amount of ERC20 tokens to this contract
        TransferHelper.safeTransferFrom(tokenAddress, msg.sender, address(this), amount);

        // Add the created swap to the map
        swaps[preimageHash] = Swap({
            amount: amount,
            tokenAddress: tokenAddress,
            claimAddress: claimAddress,
            refundAddress: msg.sender,
            timelock: timelock
        });

        // Emit an event for the swap creation
        emit Lockup(preimageHash);
    }

    function claim(bytes32 preimage) external {
        bytes32 preimageHash = sha256(abi.encodePacked(preimage));
        checkSwapExists(preimageHash);

        // Load the swap from the map in the memory and delete it from the map
        Swap memory swap = swaps[preimageHash];
        delete swaps[preimageHash];

        // Transfer the ERC20 tokens to the recipient
        TransferHelper.safeTransfer(swap.tokenAddress, swap.claimAddress, swap.amount);

        // Emit an event for the successful claim
        emit Claim(preimageHash, preimage);
    }

    function refund(bytes32 preimageHash) external onlyPendingSwaps(preimageHash) {
        require(swaps[preimageHash].timelock <= block.number, "ERC20Swap: swap has not timed out yet");

        // Load the swap from the map in the memory and delete it from the map
        Swap memory swap = swaps[preimageHash];
        delete swaps[preimageHash];

        // Transfer the ERC20 tokens back to the initial sender
        TransferHelper.safeTransfer(swap.tokenAddress, swap.refundAddress, swap.amount);

        // Emit an event for the refund
        emit Refund(preimageHash);
    }
}
