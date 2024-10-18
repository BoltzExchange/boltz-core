// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "./SigUtils.sol";
import "../EtherSwap.sol";

contract EtherSwapFuzzTest is Test {
    EtherSwap internal swap = new EtherSwap();

    receive() external payable {}

    function testLock(uint256 amount, bytes32 preimageHash, address payable claimAddress, uint256 timelock) external {
        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));
    }

    function testLockPrepayMinerFee(
        uint256 amount,
        uint256 prepayAmount,
        bytes32 preimageHash,
        address payable claimAddress,
        uint256 timelock
    ) external {
        // Make sure that address can be paid
        (bool claimAddressPayable,) = claimAddress.call{value: 1}("");
        vm.assume(claimAddressPayable);

        vm.assume(claimAddress != address(this));
        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);
        vm.assume(prepayAmount < amount);

        uint256 claimAddressBalanceBefore = claimAddress.balance;

        swap.lockPrepayMinerfee{value: amount}(preimageHash, claimAddress, timelock, prepayAmount);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount - prepayAmount, claimAddress, address(this), timelock))
        );

        assertEq(claimAddress.balance, claimAddressBalanceBefore + prepayAmount);
    }

    function testLockClaim(uint256 amount, bytes32 preimage, address payable claimAddress, uint256 timelock) external {
        // Make sure that address can be paid
        (bool claimAddressPayable,) = claimAddress.call{value: 1}("");
        vm.assume(claimAddressPayable);

        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));

        uint256 claimAddressBalanceBefore = claimAddress.balance;

        vm.startPrank(claimAddress);
        swap.claim(preimage, amount, address(this), timelock);
        assertEq(claimAddress.balance, claimAddressBalanceBefore + amount);

        assertFalse(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));
    }

    function testLockClaimInvalidPreimage(
        uint256 amount,
        bytes32 preimage,
        bytes32 invalidPreimage,
        address payable claimAddress,
        uint256 timelock
    ) external {
        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        vm.assume(preimage != invalidPreimage);

        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));

        vm.startPrank(claimAddress);
        vm.expectRevert("EtherSwap: swap has no Ether locked in the contract");
        swap.claim(invalidPreimage, amount, address(this), timelock);
    }

    function testLockRefund(uint256 amount, bytes32 preimageHash, address payable claimAddress, uint256 timelock)
        external
    {
        vm.roll(6_573_352);

        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        vm.assume(timelock <= block.number);

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));

        uint256 thisBalanceBefore = address(this).balance;

        swap.refund(preimageHash, amount, claimAddress, timelock);
        assertEq(address(this).balance, thisBalanceBefore + amount);

        assertFalse(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));
    }

    function testLockRefundTimelockNotPassed(
        uint256 amount,
        bytes32 preimageHash,
        address payable claimAddress,
        uint256 timelock
    ) external {
        vm.roll(6_573_352);

        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        vm.assume(timelock > block.number);

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));

        vm.expectRevert("EtherSwap: swap has not timed out yet");
        swap.refund(preimageHash, amount, claimAddress, timelock);

        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));
    }

    function testLockRefundCooperativeInvalidSignature(
        uint256 amount,
        bytes32 preimageHash,
        address payable claimAddress,
        uint256 timelock,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        vm.assume(amount < address(this).balance);
        vm.assume(amount > 0);

        swap.lock{value: amount}(preimageHash, claimAddress, timelock);
        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));

        vm.expectRevert("EtherSwap: invalid signature");
        swap.refundCooperative(preimageHash, amount, claimAddress, timelock, v, r, s);

        assertTrue(swap.swaps(swap.hashValues(preimageHash, amount, claimAddress, address(this), timelock)));
    }
}
