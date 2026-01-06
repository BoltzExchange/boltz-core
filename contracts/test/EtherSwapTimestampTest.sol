// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {EtherSwapTimestamp} from "../EtherSwapTimestamp.sol";

contract EtherSwapTimestampTest is Test {
    event Lockup(
        bytes32 indexed preimageHash,
        uint256 amount,
        address claimAddress,
        address indexed refundAddress,
        uint256 timelock
    );

    event Refund(bytes32 indexed preimageHash);

    EtherSwapTimestamp internal swap = new EtherSwapTimestamp();

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    address internal claimAddress;

    function setUp() public {
        claimAddress = vm.addr(0xA11CE);
    }

    receive() external payable {}

    function testRefundFailsOneSecondBeforeTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock - 1);

        vm.expectRevert("EtherSwap: swap has not timed out yet");
        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);
    }

    function testRefundSucceedsAtExactTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock);

        uint256 balanceBeforeRefund = address(this).balance;

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function testRefundSucceedsOneSecondAfterTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock + 1);

        uint256 balanceBeforeRefund = address(this).balance;

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function testRefundSucceedsLongAfterTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock + 30 days);

        uint256 balanceBeforeRefund = address(this).balance;

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function lock(uint256 timelock) internal {
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);
    }

    function querySwap(uint256 timelock) internal view returns (bool) {
        return swap.swaps(swap.hashValues(preimageHash, lockupAmount, claimAddress, address(this), timelock));
    }
}
