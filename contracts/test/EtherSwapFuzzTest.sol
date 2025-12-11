// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {EtherSwap} from "../EtherSwap.sol";

contract EtherSwapFuzzTest is Test {
    event Claim(bytes32 indexed preimageHash, bytes32 preimage);

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

    function testClaimBatch(uint256 batchSize) external {
        batchSize = bound(batchSize, 1, 100);
        uint256 lockupAmount = 1 ether;
        address claimAddress = vm.addr(0xA11CE);
        uint256 balanceBeforeClaim = claimAddress.balance;

        bytes32[] memory preimages = new bytes32[](batchSize);
        bytes32[] memory preimageHashes = new bytes32[](batchSize);
        uint256[] memory amounts = new uint256[](batchSize);
        address[] memory refundAddresses = new address[](batchSize);
        uint256[] memory timelocks = new uint256[](batchSize);

        uint256 totalLockupAmount = 0;

        for (uint256 i = 0; i < batchSize; i++) {
            preimages[i] = sha256(abi.encodePacked(bytes32(i + 1)));
            preimageHashes[i] = sha256(abi.encodePacked(preimages[i]));
            amounts[i] = (i == 0) ? lockupAmount : (100 + i * 100);
            refundAddresses[i] = address(this);
            timelocks[i] = block.number + (i * 21);

            swap.lock{value: amounts[i]}(preimageHashes[i], claimAddress, timelocks[i]);
            totalLockupAmount += amounts[i];
        }

        vm.prank(claimAddress);

        for (uint256 i = 0; i < batchSize; i++) {
            vm.expectEmit(true, false, false, true, address(swap));
            emit Claim(preimageHashes[i], preimages[i]);
        }

        swap.claimBatch(preimages, amounts, refundAddresses, timelocks);

        for (uint256 i = 0; i < batchSize; i++) {
            assertFalse(
                swap.swaps(
                    swap.hashValues(preimageHashes[i], amounts[i], claimAddress, refundAddresses[i], timelocks[i])
                )
            );
        }

        assertEq(address(swap).balance, 0);
        assertEq(claimAddress.balance - balanceBeforeClaim, totalLockupAmount);
    }

    function testHashValuesMatchesKeccak256(
        bytes32 preimageHash,
        uint256 amount,
        address claimAddress,
        address refundAddress,
        uint256 timelock
    ) external view {
        bytes32 assemblyHash = swap.hashValues(preimageHash, amount, claimAddress, refundAddress, timelock);
        bytes32 solidityHash = keccak256(abi.encode(preimageHash, amount, claimAddress, refundAddress, timelock));
        assertEq(assemblyHash, solidityHash);
    }
}
