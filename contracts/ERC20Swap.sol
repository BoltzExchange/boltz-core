pragma solidity ^0.5.0 <0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Swap {
    struct Swap {
        uint256 amount;
        address erc20Token;

        address claimAddress;
        address refundAddress;

        uint256 timelock;

        // True if the swap is pending; false if it was claimed or refunded
        bool pending;
    }

    mapping (bytes32 => Swap) private swaps;

    event Claim(bytes32 _preimageHash);
    event Creation(bytes32 _preimageHash);
    event Refund(bytes32 _preimageHash);

    modifier onlyPendingSwaps(bytes32 _preimageHash) {
        require(swaps[_preimageHash].pending == true, "there is no pending swap with this preimage hash");
        _;
    }

    // TODO: does the length of the preiamge need to enforced if the data types "bytes32" is used?
    function create(bytes32 _preimageHash, uint256 _amount, address _erc20Token, address _claimAddress, uint256 _timelock) external {
        require(_amount > 0, "the amount must not be zero");
        require(swaps[_preimageHash].amount == 0, "a swap with this preimage hash exists already");

        // Transfer the requested amount of ERC20 tokens to this contract
        ERC20 tokenContract = ERC20(_erc20Token);

        require(tokenContract.allowance(msg.sender, address(this)) >= _amount, "requested amount exceeds allowance");
        require(tokenContract.transferFrom(msg.sender, address(this), _amount), "could not transfer ERC20 tokens");

        // Add the created swap to the map
        swaps[_preimageHash] = Swap({
            amount: _amount,
            erc20Token: _erc20Token,
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

        // Transfer the ERC20 tokens to the recipient
        ERC20 tokenContract = ERC20(swap.erc20Token);
        require(tokenContract.transfer(swap.claimAddress, swap.amount), "could not transfer ERC20 tokens");

        // Emit an event for the successful claim
        emit Claim(_preimageHash);
    }

    function refund(bytes32 _preimageHash) external onlyPendingSwaps(_preimageHash) {
        require(swaps[_preimageHash].timelock <= block.timestamp, "swap has not timed out yet");

        swaps[_preimageHash].pending = false;
        Swap memory swap = swaps[_preimageHash];

        // Transfer the ERC20 tokens back to the initial sender
        ERC20 tokenContract = ERC20(swap.erc20Token);
        require(tokenContract.transfer(swap.refundAddress, swap.amount), "could not transfer ERC20 tokens");

        // Emit an event for the refund
        emit Refund(_preimageHash);
    }

    function getSwapInfo(bytes32 _preimageHash) external view returns (
        uint256 amount,
        address erc20Token,
        address claimAddress,
        address refundAddress,
        uint256 timelock,
        bool pending
    ) {
        Swap memory swap = swaps[_preimageHash];
        return (swap.amount, swap.erc20Token, swap.claimAddress, swap.refundAddress, swap.timelock, swap.pending);
    }
}