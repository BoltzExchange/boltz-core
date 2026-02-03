// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
import {ERC20SwapTimestamp} from "../ERC20SwapTimestamp.sol";
import {TestERC20} from "../TestERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20SwapTimestampTest is Test {
    event Lockup(
        bytes32 indexed preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address indexed refundAddress,
        uint256 timelock
    );

    event Refund(bytes32 indexed preimageHash);

    ERC20SwapTimestamp internal swap = new ERC20SwapTimestamp();

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    address internal claimAddress;

    uint256 internal mintAmount = lockupAmount * 2;
    IERC20 internal token = new TestERC20("TestERC20", "TRC", 18, mintAmount);

    function setUp() public {
        claimAddress = vm.addr(0xA11CE);
    }

    function testRefundFailsOneSecondBeforeTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock - 1);

        vm.expectRevert(ERC20Swap.SwapNotTimedOut.selector);
        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);
    }

    function testRefundSucceedsAtExactTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function testRefundSucceedsOneSecondAfterTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock + 1);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function testRefundSucceedsLongAfterTimeout() external {
        uint256 timelock = block.timestamp + 3600;
        lock(timelock);

        vm.warp(timelock + 30 days);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        assertFalse(querySwap(timelock));
        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function lock(uint256 timelock) internal {
        token.approve(address(swap), lockupAmount);
        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, timelock);
    }

    function querySwap(uint256 timelock) internal view returns (bool) {
        return
            swap.swaps(
                swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock)
            );
    }
}
