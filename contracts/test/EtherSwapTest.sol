// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "./SigUtils.sol";
import "../EtherSwap.sol";

contract EtherSwapTest is Test {
    event Lockup(
        bytes32 indexed preimageHash,
        uint256 amount,
        address claimAddress,
        address indexed refundAddress,
        uint256 timelock
    );

    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);

    EtherSwap internal swap = new EtherSwap();

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress;
    address payable internal constant destination = payable(0x3d9cc5780CA1db78760ad3D35458509178A85A4A);

    SigUtils internal sigUtils;

    function setUp() public {
        claimAddress = vm.addr(claimAddressKey);
        sigUtils = new SigUtils(swap.DOMAIN_SEPARATOR());
    }

    receive() external payable {}

    function testCorrectVersion() external view {
        assertEq(swap.version(), 5);
    }

    function testNoSendEtherWithoutFunctionSig() external {
        (bool success,) = address(swap).call{value: 1}("");
        require(!success);
    }

    function testHashSwapValues() external view {
        uint256 timelock = block.number;

        assertEq(
            swap.hashValues(preimageHash, lockupAmount, claimAddress, address(this), timelock),
            keccak256(abi.encodePacked(preimageHash, lockupAmount, claimAddress, address(this), timelock))
        );
    }

    function testLockup0ValueFail() external {
        vm.expectRevert("EtherSwap: locked amount must not be zero");
        swap.lock(preimageHash, claimAddress, block.number);
    }

    function testLock() external {
        uint256 timelock = block.number;

        vm.expectEmit(true, true, false, true, address(swap));
        emit Lockup(preimageHash, lockupAmount, claimAddress, address(this), timelock);

        lock(timelock);
        assertEq(address(swap).balance, lockupAmount);
        assertTrue(querySwap(timelock));
    }

    function testLockWithSameHashValueFail() external {
        uint256 timelock = block.number;

        lock(timelock);

        vm.expectRevert("EtherSwap: swap exists already");
        lock(timelock);
    }

    function testClaimWithInvalidPreimageFail() external {
        uint256 timelock = block.number;

        lock(timelock);

        vm.prank(claimAddress);
        try swap.claim(sha256("incorrect"), lockupAmount, address(this), timelock) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "EtherSwap: swap has no Ether locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testClaim() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = claimAddress.balance;

        lock(timelock);

        vm.prank(claimAddress);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        swap.claim(preimage, lockupAmount, address(this), timelock);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(claimAddress.balance - balanceBeforeClaim, lockupAmount);
    }

    function testClaimAddress() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = claimAddress.balance;

        lock(timelock);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        swap.claim(preimage, lockupAmount, claimAddress, address(this), timelock);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(claimAddress.balance - balanceBeforeClaim, lockupAmount);
    }

    function testClaimWithSignature() external {
        uint256 timelock = block.number + 21;
        lock(timelock);

        uint256 balanceBeforeClaim = address(destination).balance;

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashEtherSwapClaim(
                    swap.TYPEHASH_CLAIM(), preimage, lockupAmount, address(this), timelock, destination
                )
            )
        );

        vm.expectEmit(true, false, false, false, address(swap));
        emit Claim(preimageHash, preimage);

        vm.prank(destination);
        address recovered = swap.claim(preimage, lockupAmount, address(this), timelock, v, r, s);
        assertEq(recovered, claimAddress);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(address(destination).balance - balanceBeforeClaim, lockupAmount);
    }

    function testClaimWithSignatureInvalid() external {
        uint256 timelock = block.number + 21;
        lock(timelock);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashEtherSwapClaim(
                    swap.TYPEHASH_CLAIM(), preimage, lockupAmount, address(this), timelock, destination
                )
            )
        );

        vm.expectRevert("EtherSwap: swap has no Ether locked in the contract");
        swap.claim(preimage, lockupAmount, address(this), timelock, v, r, s);
    }

    function testClaimBatchTwo() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = claimAddress.balance;

        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        bytes32 preimageSecond = sha256("2");
        bytes32 preimageHashSecond = sha256(abi.encodePacked(preimageSecond));

        uint256 lockupAmountSecond = 123;
        uint256 timelockSecond = block.number + 21;

        swap.lock{value: lockupAmountSecond}(preimageHashSecond, claimAddress, timelockSecond);

        bytes32[] memory preimages = new bytes32[](2);
        preimages[0] = preimage;
        preimages[1] = preimageSecond;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = lockupAmount;
        amounts[1] = lockupAmountSecond;

        address[] memory refundAddresses = new address[](2);
        refundAddresses[0] = address(this);
        refundAddresses[1] = address(this);

        uint256[] memory timelocks = new uint256[](2);
        timelocks[0] = timelock;
        timelocks[1] = timelockSecond;

        vm.prank(claimAddress);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHashSecond, preimageSecond);

        swap.claimBatch(preimages, amounts, refundAddresses, timelocks);

        assertEq(address(swap).balance, 0);
        assertEq(claimAddress.balance - balanceBeforeClaim, lockupAmount + lockupAmountSecond);
    }

    function testClaimBatchThree() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = claimAddress.balance;

        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        bytes32 preimageSecond = sha256("2");
        bytes32 preimageHashSecond = sha256(abi.encodePacked(preimageSecond));

        uint256 lockupAmountSecond = 123;
        uint256 timelockSecond = block.number + 21;

        swap.lock{value: lockupAmountSecond}(preimageHashSecond, claimAddress, timelockSecond);

        bytes32 preimageThird = sha256("3");
        bytes32 preimageHashThird = sha256(abi.encodePacked(preimageThird));

        uint256 lockupAmountThird = 321;
        uint256 timelockThird = block.number + 42;

        swap.lock{value: lockupAmountThird}(preimageHashThird, claimAddress, timelockThird);

        bytes32[] memory preimages = new bytes32[](3);
        preimages[0] = preimage;
        preimages[1] = preimageSecond;
        preimages[2] = preimageThird;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = lockupAmount;
        amounts[1] = lockupAmountSecond;
        amounts[2] = lockupAmountThird;

        address[] memory refundAddresses = new address[](3);
        refundAddresses[0] = address(this);
        refundAddresses[1] = address(this);
        refundAddresses[2] = address(this);

        uint256[] memory timelocks = new uint256[](3);
        timelocks[0] = timelock;
        timelocks[1] = timelockSecond;
        timelocks[2] = timelockThird;

        vm.prank(claimAddress);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHashSecond, preimageSecond);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHashThird, preimageThird);

        swap.claimBatch(preimages, amounts, refundAddresses, timelocks);

        assertEq(address(swap).balance, 0);
        assertEq(claimAddress.balance - balanceBeforeClaim, lockupAmount + lockupAmountSecond + lockupAmountThird);
    }

    function testClaimTwiceFail() external {
        uint256 timelock = block.number;

        lock(timelock);

        vm.startPrank(claimAddress);
        swap.claim(preimage, lockupAmount, address(this), timelock);

        try swap.claim(preimage, lockupAmount, address(this), timelock) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "EtherSwap: swap has no Ether locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testClaimBatchTwiceFail() external {
        uint256 timelock = block.number;

        lock(timelock);

        bytes32[] memory preimages = new bytes32[](2);
        preimages[0] = preimage;
        preimages[1] = preimage;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = lockupAmount;
        amounts[1] = lockupAmount;

        address[] memory refundAddresses = new address[](2);
        refundAddresses[0] = address(this);
        refundAddresses[1] = address(this);

        uint256[] memory timelocks = new uint256[](2);
        timelocks[0] = timelock;
        timelocks[1] = timelock;

        vm.prank(claimAddress);
        try swap.claimBatch(preimages, amounts, refundAddresses, timelocks) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "EtherSwap: swap has no Ether locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testRefund() external {
        uint256 timelock = block.number;

        lock(timelock);

        uint256 balanceBeforeRefund = address(this).balance;

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function testRefundAddress() external {
        uint256 timelock = block.number;

        lock(timelock);

        uint256 balanceBeforeRefund = address(this).balance;

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        vm.prank(claimAddress);
        swap.refund(preimageHash, lockupAmount, claimAddress, address(this), timelock);

        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function testRefundTwiceFail() external {
        uint256 timelock = block.number;

        lock(timelock);

        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);

        vm.expectRevert("EtherSwap: swap has no Ether locked in the contract");
        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);
    }

    function testRefundNotTimedOutFail() external {
        uint256 timelock = block.number + 1;

        lock(timelock);

        vm.expectRevert("EtherSwap: swap has not timed out yet");
        swap.refund(preimageHash, lockupAmount, claimAddress, timelock);
    }

    function testRefundCooperative() external {
        uint256 timelock = block.number + 21;

        lock(timelock);

        uint256 balanceBeforeRefund = address(this).balance;

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashEtherSwapRefund(swap.TYPEHASH_REFUND(), preimageHash, lockupAmount, claimAddress, timelock)
            )
        );

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refundCooperative(preimageHash, lockupAmount, claimAddress, timelock, v, r, s);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(address(this).balance - balanceBeforeRefund, lockupAmount);
    }

    function testRefundCooperativeInvalidSigFail() external {
        uint256 timelock = block.number + 21;

        lock(timelock);

        uint8 v = 1;
        bytes32 r = keccak256("invalid");
        bytes32 s = keccak256("sig");

        vm.expectRevert("EtherSwap: invalid signature");
        swap.refundCooperative(preimageHash, lockupAmount, claimAddress, timelock, v, r, s);
    }

    function testLockupPrepayMinerFee() external {
        uint256 timelock = block.number;
        uint256 prepayAmount = 123000;

        vm.expectEmit(true, true, false, true, address(swap));
        emit Lockup(preimageHash, lockupAmount, claimAddress, address(this), timelock);

        swap.lockPrepayMinerfee{value: lockupAmount + prepayAmount}(
            preimageHash, payable(claimAddress), timelock, prepayAmount
        );

        assertEq(address(swap).balance, lockupAmount);
        assertEq(claimAddress.balance, prepayAmount);

        assertTrue(querySwap(timelock));
    }

    function testLockupPrepayMinerFeeGtValueFail() external {
        vm.expectRevert("EtherSwap: sent amount must be greater than the prepay amount");
        swap.lockPrepayMinerfee{value: 1}(preimageHash, payable(claimAddress), block.number, 2);
    }

    function testLockupPrepayMinerFeeEqValueFail() external {
        vm.expectRevert("EtherSwap: sent amount must be greater than the prepay amount");
        swap.lockPrepayMinerfee{value: 1}(preimageHash, payable(claimAddress), block.number, 1);
    }

    function lock(uint256 timelock) internal {
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);
    }

    function querySwap(uint256 timelock) internal view returns (bool) {
        return swap.swaps(swap.hashValues(preimageHash, lockupAmount, claimAddress, address(this), timelock));
    }
}
