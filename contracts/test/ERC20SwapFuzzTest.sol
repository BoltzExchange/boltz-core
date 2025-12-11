// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
import {TestERC20} from "../TestERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20SwapFuzzTest is Test {
    ERC20Swap internal swap = new ERC20Swap();
    IERC20 internal token = new TestERC20("TestERC20", "TRC", 18, 10 ** 21);

    function testLock(uint256 amount, bytes32 preimageHash, address claimAddress, uint256 timelock) external {
        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );
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

        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        vm.assume(prepayAmount < address(this).balance);

        uint256 claimAddressBalanceBefore = claimAddress.balance;

        token.approve(address(swap), amount);
        swap.lockPrepayMinerfee{value: prepayAmount}(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        assertEq(claimAddress.balance, claimAddressBalanceBefore + prepayAmount);
    }

    function testLockClaim(uint256 amount, bytes32 preimage, address claimAddress, uint256 timelock) external {
        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        vm.assume(claimAddress != address(0));
        vm.assume(claimAddress != address(swap));

        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        uint256 claimAddressBalanceBefore = token.balanceOf(claimAddress);

        vm.startPrank(claimAddress);
        swap.claim(preimage, amount, address(token), address(this), timelock);
        assertEq(token.balanceOf(claimAddress), claimAddressBalanceBefore + amount);

        assertFalse(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );
    }

    function testLockClaimInvalidPreimage(
        uint256 amount,
        bytes32 preimage,
        bytes32 invalidPreimage,
        address payable claimAddress,
        uint256 timelock
    ) external {
        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        vm.assume(preimage != invalidPreimage);

        bytes32 preimageHash = sha256(abi.encodePacked(preimage));

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        vm.startPrank(claimAddress);
        vm.expectRevert("ERC20Swap: swap has no tokens locked in the contract");
        swap.claim(invalidPreimage, amount, address(token), address(this), timelock);
    }

    function testLockRefund(uint256 amount, bytes32 preimageHash, address payable claimAddress, uint256 timelock)
        external
    {
        vm.roll(6_573_352);

        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        vm.assume(timelock <= block.number);

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        uint256 thisBalanceBefore = token.balanceOf(address(this));

        swap.refund(preimageHash, amount, address(token), claimAddress, timelock);
        assertEq(token.balanceOf(address(this)), thisBalanceBefore + amount);

        assertFalse(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );
    }

    function testLockRefundTimelockNotPassed(
        uint256 amount,
        bytes32 preimageHash,
        address payable claimAddress,
        uint256 timelock
    ) external {
        vm.roll(6_573_352);

        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        vm.assume(timelock > block.number);

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        vm.expectRevert("ERC20Swap: swap has not timed out yet");
        swap.refund(preimageHash, amount, address(token), claimAddress, timelock);

        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );
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
        vm.assume(amount < token.balanceOf(address(this)));
        vm.assume(amount > 0);

        token.approve(address(swap), amount);
        swap.lock(preimageHash, amount, address(token), claimAddress, timelock);
        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );

        vm.expectRevert("ERC20Swap: invalid signature");
        swap.refundCooperative(preimageHash, amount, address(token), claimAddress, timelock, v, r, s);

        assertTrue(
            swap.swaps(swap.hashValues(preimageHash, amount, address(token), claimAddress, address(this), timelock))
        );
    }

    function testHashValuesMatchesKeccak256(
        bytes32 preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address refundAddress,
        uint256 timelock
    ) external view {
        bytes32 assemblyHash = swap.hashValues(
            preimageHash, amount, tokenAddress, claimAddress, refundAddress, timelock
        );
        bytes32 solidityHash =
            keccak256(abi.encode(preimageHash, amount, tokenAddress, claimAddress, refundAddress, timelock));
        assertEq(assemblyHash, solidityHash);
    }
}
