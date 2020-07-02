// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.6.11;

contract EtherSwap {
    uint8 constant public version = 1;

    struct Swap {
        uint256 amount;

        address payable claimAddress;
        address payable refundAddress;

        uint timelock;
    }

    mapping (bytes32 => Swap) public swaps;

    event Lockup(bytes32 indexed preimageHash);

    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);

    function checkSwapExists(bytes32 preimageHash) private view {
        require(swaps[preimageHash].amount != 0, "EtherSwap: no swap with preimage hash");
    }

    modifier onlySwaps(bytes32 preimageHash) {
        checkSwapExists(preimageHash);
        _;
    }

    function lock(bytes32 preimageHash, address payable claimAddress, uint timelock) external payable {
        require(msg.value > 0, "EtherSwap: amount must not be zero");
        require(swaps[preimageHash].amount == 0, "EtherSwap: swap with preimage hash exists already");

        // Add the created swap to the map
        swaps[preimageHash] = Swap({
            amount: msg.value,
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

        // Transfer the Ether to the recipient
        swap.claimAddress.transfer(swap.amount);

        // Emit an event for the successful claim
        emit Claim(preimageHash, preimage);
    }

    function refund(bytes32 preimageHash) external onlySwaps(preimageHash) {
        require(swaps[preimageHash].timelock <= block.number, "EtherSwap: swap has not timed out yet");

        // Load the swap from the map in the memory and delete it from the map
        Swap memory swap = swaps[preimageHash];
        delete swaps[preimageHash];

        // Transfer the Ether back to the initial sender
        swap.refundAddress.transfer(swap.amount);

        // Emit an event for the refund
        emit Refund(preimageHash);
    }
}
