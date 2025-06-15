// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import "./TransferHelper.sol";
import "./EtherSwap.sol";

contract Router {
    struct Claim {
        bytes32 preimage;
        uint256 amount;
        address refundAddress;
        uint256 timelock;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Call {
        address target;
        uint256 value;
        bytes callData;
    }

    error ClaimFailed();
    error CallFailed(uint256 index, address target);
    error InvalidTarget();

    EtherSwap public immutable SWAP_CONTRACT;

    constructor(address swapContract) {
        SWAP_CONTRACT = EtherSwap(payable(swapContract));
    }

    function claimExecute(Claim calldata claim, Call[] calldata calls, address token, uint256 sweepAmount)
        external
        payable
    {
        address claimAddress = SWAP_CONTRACT.claim(
            claim.preimage, claim.amount, claim.refundAddress, claim.timelock, claim.v, claim.r, claim.s
        );
        if (claimAddress != msg.sender) {
            revert ClaimFailed();
        }

        uint256 length = calls.length;
        Call calldata c;
        for (uint256 i = 0; i < length; i++) {
            c = calls[i];

            if (c.target == address(SWAP_CONTRACT)) {
                revert InvalidTarget();
            }

            (bool success,) = c.target.call{value: c.value}(c.callData);
            if (!success) {
                revert CallFailed(i, c.target);
            }
        }

        if (token == address(0)) {
            TransferHelper.transferEther(payable(claimAddress), sweepAmount);
        } else {
            TransferHelper.safeTransferToken(token, claimAddress, sweepAmount);
        }
    }

    receive() external payable {}
}
