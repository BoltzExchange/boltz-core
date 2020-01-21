pragma solidity 0.5.16;

contract EtherSwap {
    struct Swap {
        uint256 amount;

        address payable claimAddress;
        address payable refundAddress;

        uint256 timelock;

        // True if the swap is pending; false if it was claimed or refunded
        bool pending;
    }

    mapping (bytes32 => Swap) public swaps;

    event Claim(bytes32 _preimageHash);
    event Creation(bytes32 _preimageHash);
    event Refund(bytes32 _preimageHash);

    modifier onlyPendingSwaps(bytes32 _preimageHash) {
        require(swaps[_preimageHash].pending == true, "there is no pending swap with this preimage hash");
        _;
    }

    function create(bytes32 _preimageHash, address payable _claimAddress, uint256 _timelock) external payable {
        require(msg.value > 0, "the amount must not be zero");
        require(swaps[_preimageHash].amount == 0, "a swap with this preimage hash exists already");

        // Add the created swap to the map
        swaps[_preimageHash] = Swap({
            amount: msg.value,
            claimAddress: _claimAddress,
            refundAddress: msg.sender,
            timelock: _timelock,
            pending: true
        });

        // Emit an event for the swap creation
        emit Creation(_preimageHash);
    }

    function claim(bytes32 _preimageHash, bytes calldata _preimage) external onlyPendingSwaps(_preimageHash) {
        require(_preimage.length == 32, "the preimage has to the have a length of 32 bytes");
        require(_preimageHash == sha256(_preimage), "the preimage does not correspond the provided hash");

        swaps[_preimageHash].pending = false;
        Swap memory swap = swaps[_preimageHash];

        // Transfer the Ether to the recipient
        swap.claimAddress.transfer(swap.amount);

        // Emit an event for the successful claim
        emit Claim(_preimageHash);
    }

    function refund(bytes32 _preimageHash) external onlyPendingSwaps(_preimageHash) {
        require(swaps[_preimageHash].timelock <= block.timestamp, "swap has not timed out yet");

        swaps[_preimageHash].pending = false;
        Swap memory swap = swaps[_preimageHash];

        // Transfer the Ether back to the initial sender
        swap.refundAddress.transfer(swap.amount);

        // Emit an event for the refund
        emit Refund(_preimageHash);
    }
}
