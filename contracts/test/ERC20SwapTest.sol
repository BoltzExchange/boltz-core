// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {SigUtils} from "./SigUtils.sol";
import {BadERC20} from "../BadERC20.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
import {TestERC20} from "../TestERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20SwapTest is Test {
    event Lockup(
        bytes32 indexed preimageHash,
        uint256 amount,
        address tokenAddress,
        address claimAddress,
        address indexed refundAddress,
        uint256 timelock
    );

    event Claim(bytes32 indexed preimageHash, bytes32 preimage);
    event Refund(bytes32 indexed preimageHash);

    ERC20Swap internal swap = new ERC20Swap();

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress;
    uint256 internal refundAddressKey = 0xB0B;
    address internal refundAddress;

    address internal constant DESTINATION = 0x3d9cc5780CA1db78760ad3D35458509178A85A4A;

    uint256 internal mintAmount = lockupAmount * 2;

    IERC20 internal token = new TestERC20("TestERC20", "TRC", 18, mintAmount);

    SigUtils internal sigUtils;

    function setUp() public {
        claimAddress = vm.addr(claimAddressKey);
        sigUtils = new SigUtils(swap.DOMAIN_SEPARATOR());
        refundAddress = vm.addr(refundAddressKey);

        vm.deal(refundAddress, 10 ether);
    }

    function testCorrectVersion() external view {
        assertEq(swap.VERSION(), 5);
    }

    function testShouldNotAcceptEther() external {
        (bool success,) = address(swap).call{value: 1}("");
        require(!success);
    }

    function testHashSwapValues() external view {
        uint256 timelock = block.number;

        bytes32 expected = 0xad8532e90332ace0cb288c646004af326b3c9ac0060cd804d4e8c7a597ad04ae;
        assertEq(
            swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock), expected
        );
        assertNotEq(
            swap.hashValues(sha256("different"), lockupAmount, address(token), claimAddress, address(this), timelock),
            expected
        );
        assertNotEq(
            swap.hashValues(preimageHash, lockupAmount + 1, address(token), claimAddress, address(this), timelock),
            expected
        );
        assertNotEq(
            swap.hashValues(preimageHash, lockupAmount, claimAddress, claimAddress, address(this), timelock), expected
        );
        assertNotEq(
            swap.hashValues(preimageHash, lockupAmount, address(token), address(this), address(this), timelock),
            expected
        );
        assertNotEq(
            swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, claimAddress, timelock), expected
        );
        assertNotEq(
            swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock + 1),
            expected
        );
    }

    function testLockup0ValueFail() external {
        vm.expectRevert("ERC20Swap: locked amount must not be zero");
        swap.lock(preimageHash, 0, address(token), claimAddress, block.number);
    }

    function testLockupNoApprovalFail() external {
        vm.expectRevert("TransferHelper: could not transferFrom ERC20 tokens");
        lock(block.number);
    }

    function testLockup() external {
        token.approve(address(swap), lockupAmount);

        uint256 timelock = block.number;

        vm.expectEmit(true, true, false, true, address(swap));
        emit Lockup(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock);

        lock(timelock);

        assertEq(token.balanceOf(address(swap)), lockupAmount);
        assertEq(token.balanceOf(address(this)), mintAmount - lockupAmount);
        assertTrue(querySwap(timelock));
    }

    function testLockupWithRefundAddress() external {
        token.approve(address(swap), lockupAmount);

        uint256 timelock = block.number;

        vm.expectEmit(true, true, false, true, address(swap));
        emit Lockup(preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock);

        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock);

        assertEq(token.balanceOf(address(swap)), lockupAmount);
        assertEq(token.balanceOf(address(this)), mintAmount - lockupAmount);
        assertTrue(
            swap.swaps(
                swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock)
            )
        );
    }

    function testLockWithSameHashValueFail() external {
        token.approve(address(swap), lockupAmount * 2);

        uint256 timelock = block.number;
        lock(timelock);

        vm.expectRevert("ERC20Swap: swap exists already");
        lock(timelock);
    }

    function testClaimWithInvalidPreimageFail() external {
        token.approve(address(swap), lockupAmount);

        uint256 timelock = block.number;

        lock(timelock);

        vm.prank(claimAddress);
        try swap.claim(sha256("incorrect"), lockupAmount, address(token), address(this), timelock) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "ERC20Swap: swap has no tokens locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testClaim() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        vm.prank(claimAddress);
        swap.claim(preimage, lockupAmount, address(token), address(this), timelock);

        assertEq(token.balanceOf(claimAddress), lockupAmount);
        assertEq(token.balanceOf(address(swap)), 0);

        assertFalse(querySwap(timelock));
    }

    function testClaimAddress() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(preimageHash, preimage);

        swap.claim(preimage, lockupAmount, address(token), claimAddress, address(this), timelock);

        assertEq(token.balanceOf(claimAddress), lockupAmount);
        assertEq(token.balanceOf(address(swap)), 0);

        assertFalse(querySwap(timelock));
    }

    function testClaimWithSignature() external {
        uint256 timelock = block.number + 21;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        uint256 balanceBeforeClaim = token.balanceOf(DESTINATION);

        (uint8 v, bytes32 r, bytes32 s) = generateClaimSignature(timelock);

        vm.expectEmit(true, false, false, false, address(swap));
        emit Claim(preimageHash, preimage);

        vm.prank(DESTINATION);
        address recovered = swap.claim(preimage, lockupAmount, address(token), address(this), timelock, v, r, s);
        assertEq(recovered, claimAddress);

        assertFalse(querySwap(timelock));

        assertEq(address(swap).balance, 0);
        assertEq(token.balanceOf(DESTINATION) - balanceBeforeClaim, lockupAmount);
    }

    function testClaimWithSignatureInvalid() external {
        uint256 timelock = block.number + 21;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        (uint8 v, bytes32 r, bytes32 s) = generateClaimSignature(timelock);

        vm.expectRevert("ERC20Swap: swap has no tokens locked in the contract");
        swap.claim(preimage, lockupAmount, address(token), address(this), timelock, v, r, s);
    }

    function testCommitClaim() external {
        uint256 timelock = block.number + 21;

        require(token.transfer(refundAddress, lockupAmount));

        vm.startPrank(refundAddress);
        token.approve(address(swap), lockupAmount);
        swap.lock(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock);
        vm.stopPrank();

        assertTrue(
            swap.swaps(swap.hashValues(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock))
        );

        bytes32 actualPreimageHash = sha256(abi.encodePacked(preimage));
        (uint8 v, bytes32 r, bytes32 s) = generateCommitSignature(actualPreimageHash, lockupAmount, timelock);

        // Signature should verify positively via the helper function
        assertTrue(
            swap.checkCommitmentSignature(
                actualPreimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock, v, r, s
            )
        );

        uint256 balanceBeforeClaim = token.balanceOf(claimAddress);

        vm.prank(claimAddress);
        vm.expectEmit(true, false, false, true, address(swap));
        emit Claim(actualPreimageHash, preimage);

        swap.claim(preimage, lockupAmount, address(token), claimAddress, refundAddress, timelock, v, r, s);

        assertEq(token.balanceOf(claimAddress) - balanceBeforeClaim, lockupAmount);
        assertEq(token.balanceOf(address(swap)), 0);
        assertFalse(
            swap.swaps(swap.hashValues(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock))
        );
    }

    function testCommitClaimInvalidPreimage() external {
        uint256 timelock = block.number + 21;

        require(token.transfer(refundAddress, lockupAmount));

        vm.startPrank(refundAddress);
        token.approve(address(swap), lockupAmount);
        swap.lock(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock);
        vm.stopPrank();

        bytes32 actualPreimageHash = sha256(abi.encodePacked(preimage));

        (uint8 v, bytes32 r, bytes32 s) = generateCommitSignature(actualPreimageHash, lockupAmount, timelock);

        vm.prank(claimAddress);
        vm.expectRevert("ERC20Swap: invalid signature");
        swap.claim(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock, v, r, s);
    }

    function testCommitClaimInvalidSignatureFail() external {
        uint256 timelock = block.number + 21;

        require(token.transfer(refundAddress, lockupAmount));

        vm.startPrank(refundAddress);
        token.approve(address(swap), lockupAmount);
        swap.lock(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelock);
        vm.stopPrank();

        bytes32 actualPreimageHash = sha256(abi.encodePacked(preimage));

        // Sign with the wrong key
        bytes32 commitMsg = sigUtils.hashErc20SwapCommit(
            swap.TYPEHASH_COMMIT(),
            actualPreimageHash,
            lockupAmount,
            address(token),
            claimAddress,
            refundAddress,
            timelock
        );
        bytes32 digest = sigUtils.getTypedDataHash(commitMsg);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimAddressKey, digest);

        vm.prank(claimAddress);
        vm.expectRevert("ERC20Swap: invalid signature");
        swap.claim(preimage, lockupAmount, address(token), claimAddress, refundAddress, timelock, v, r, s);
    }

    function testClaimBatchTwo() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = token.balanceOf(claimAddress);

        token.approve(address(swap), lockupAmount);
        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        bytes32 preimageSecond = sha256("2");
        bytes32 preimageHashSecond = sha256(abi.encodePacked(preimageSecond));

        uint256 lockupAmountSecond = 123;
        uint256 timelockSecond = block.number + 21;

        token.approve(address(swap), lockupAmount);
        swap.lock(preimageHashSecond, lockupAmountSecond, address(token), claimAddress, timelockSecond);

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

        swap.claimBatch(address(token), preimages, amounts, refundAddresses, timelocks);

        assertEq(address(swap).balance, 0);
        assertEq(token.balanceOf(claimAddress) - balanceBeforeClaim, lockupAmount + lockupAmountSecond);
    }

    function testClaimBatchThree() external {
        uint256 timelock = block.number;
        uint256 balanceBeforeClaim = token.balanceOf(claimAddress);

        token.approve(address(swap), lockupAmount);
        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        bytes32 preimageSecond = sha256("2");
        bytes32 preimageHashSecond = sha256(abi.encodePacked(preimageSecond));

        uint256 lockupAmountSecond = 123;
        uint256 timelockSecond = block.number + 21;

        token.approve(address(swap), lockupAmountSecond);
        swap.lock(preimageHashSecond, lockupAmountSecond, address(token), claimAddress, timelockSecond);

        bytes32 preimageThird = sha256("3");
        bytes32 preimageHashThird = sha256(abi.encodePacked(preimageThird));

        uint256 lockupAmountThird = 321;
        uint256 timelockThird = block.number + 42;

        token.approve(address(swap), lockupAmountThird);
        swap.lock(preimageHashThird, lockupAmountThird, address(token), claimAddress, timelockThird);

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

        swap.claimBatch(address(token), preimages, amounts, refundAddresses, timelocks);

        assertEq(address(swap).balance, 0);
        assertEq(
            token.balanceOf(claimAddress) - balanceBeforeClaim, lockupAmount + lockupAmountSecond + lockupAmountThird
        );
    }

    function testClaimBatchCommitAndNormal() external {
        uint256 timelockCommit = block.number + 21;
        uint256 timelockNormal = block.number + 42;

        require(token.transfer(refundAddress, lockupAmount * 2));

        // Commitment swap
        bytes32 commitPreimageHash = sha256(abi.encodePacked(preimage));

        vm.startPrank(refundAddress);
        token.approve(address(swap), lockupAmount * 2);
        swap.lock(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelockCommit);

        // Normal swap
        bytes32 preimageNormal = sha256("2");
        bytes32 preimageHashNormal = sha256(abi.encodePacked(preimageNormal));
        swap.lock(preimageHashNormal, lockupAmount, address(token), claimAddress, refundAddress, timelockNormal);

        vm.stopPrank();

        uint256 balanceBefore = token.balanceOf(claimAddress);

        {
            (uint8 vCommit, bytes32 rCommit, bytes32 sCommit) =
                generateCommitSignature(commitPreimageHash, lockupAmount, timelockCommit);

            // Prepare batch entries
            ERC20Swap.BatchClaimEntry[] memory entries = new ERC20Swap.BatchClaimEntry[](2);
            entries[0] = ERC20Swap.BatchClaimEntry({
                preimage: preimage,
                amount: lockupAmount,
                refundAddress: refundAddress,
                timelock: timelockCommit,
                v: vCommit,
                r: rCommit,
                s: sCommit
            });
            entries[1] = ERC20Swap.BatchClaimEntry({
                preimage: preimageNormal,
                amount: lockupAmount,
                refundAddress: refundAddress,
                timelock: timelockNormal,
                v: 0,
                r: bytes32(0),
                s: bytes32(0)
            });

            vm.prank(claimAddress);
            vm.expectEmit(true, false, false, true, address(swap));
            emit Claim(commitPreimageHash, preimage);
            vm.expectEmit(true, false, false, true, address(swap));
            emit Claim(preimageHashNormal, preimageNormal);

            swap.claimBatch(address(token), entries);
        }

        assertEq(token.balanceOf(claimAddress) - balanceBefore, lockupAmount * 2);
        assertEq(token.balanceOf(address(swap)), 0);

        // Verify that both swaps were removed
        bytes32 valHashCommit =
            swap.hashValues(bytes32(0), lockupAmount, address(token), claimAddress, refundAddress, timelockCommit);
        bytes32 valHashNormal = swap.hashValues(
            preimageHashNormal, lockupAmount, address(token), claimAddress, refundAddress, timelockNormal
        );
        assertFalse(swap.swaps(valHashCommit));
        assertFalse(swap.swaps(valHashNormal));
    }

    function testClaimTwiceFail() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        vm.startPrank(claimAddress);
        swap.claim(preimage, lockupAmount, address(token), address(this), timelock);

        try swap.claim(preimage, lockupAmount, address(token), address(this), timelock) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "ERC20Swap: swap has no tokens locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testClaimBatchTwiceFail() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
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
        try swap.claimBatch(address(token), preimages, amounts, refundAddresses, timelocks) {
            fail();
        } catch Error(string memory exception) {
            assertEq(string(exception), "ERC20Swap: swap has no tokens locked in the contract");
        } catch (bytes memory) {
            fail();
        }
    }

    function testRefund() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        assertFalse(querySwap(timelock));

        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function testRefundAddress() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        vm.prank(claimAddress);
        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock);

        assertFalse(querySwap(timelock));

        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function testRefundTwiceFail() external {
        uint256 timelock = block.number;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);

        vm.expectRevert("ERC20Swap: swap has no tokens locked in the contract");
        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);
    }

    function testRefundNotTimedOutFail() external {
        uint256 timelock = block.number + 1;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        vm.expectRevert("ERC20Swap: swap has not timed out yet");
        swap.refund(preimageHash, lockupAmount, address(token), claimAddress, timelock);
    }

    function testRefundCooperative() external {
        token.approve(address(swap), lockupAmount);
        lock(block.number + 21);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashErc20SwapRefund(
                    swap.TYPEHASH_REFUND(), preimageHash, lockupAmount, address(token), claimAddress, block.number + 21
                )
            )
        );

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refundCooperative(preimageHash, lockupAmount, address(token), claimAddress, block.number + 21, v, r, s);

        assertFalse(querySwap(block.number + 21));

        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(address(this)) - balanceBeforeRefund, lockupAmount);
    }

    function testRefundCooperativeInvalidSigFail() external {
        uint256 timelock = block.number + 21;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        uint8 v = 1;
        bytes32 r = keccak256("invalid");
        bytes32 s = keccak256("sig");

        vm.expectRevert("ERC20Swap: invalid signature");
        swap.refundCooperative(preimageHash, lockupAmount, address(token), claimAddress, timelock, v, r, s);
    }

    function testRefundCooperativeWithRefundAddress() external {
        uint256 timelock = block.number + 21;

        require(token.transfer(refundAddress, lockupAmount));

        vm.startPrank(refundAddress);
        token.approve(address(swap), lockupAmount);
        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock);
        vm.stopPrank();

        uint256 balanceBeforeRefund = token.balanceOf(refundAddress);

        (uint8 v, bytes32 r, bytes32 s) = generateRefundSignature(timelock);

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        vm.prank(DESTINATION);
        swap.refundCooperative(
            preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock, v, r, s
        );

        assertFalse(
            swap.swaps(
                swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, refundAddress, timelock)
            )
        );
        assertEq(token.balanceOf(address(swap)), 0);
        assertEq(token.balanceOf(refundAddress) - balanceBeforeRefund, lockupAmount);
        assertEq(token.balanceOf(DESTINATION), 0);
    }

    function testBadERC20Token() external {
        BadERC20 badToken = new BadERC20("TestERC20", "TRC", 18, mintAmount);
        uint256 timelock = block.number;

        badToken.approve(address(swap), lockupAmount);
        swap.lock(preimageHash, lockupAmount, address(badToken), claimAddress, timelock);

        assertTrue(
            swap.swaps(
                swap.hashValues(preimageHash, lockupAmount, address(badToken), claimAddress, address(this), timelock)
            )
        );

        // Check the balances to make sure tokens were transferred to the contract
        assertEq(badToken.balanceOf(address(swap)), lockupAmount);
        assertEq(badToken.balanceOf(address(this)), mintAmount - lockupAmount);

        vm.prank(claimAddress);
        swap.claim(preimage, lockupAmount, address(badToken), address(this), timelock);

        // Check the balances again to make sure tokens were transferred to the claim address
        assertEq(badToken.balanceOf(address(swap)), 0);
        assertEq(badToken.balanceOf(claimAddress), lockupAmount);
    }

    function testLockupPrepayMinerFee() external {
        uint256 claimEthBalanceBefore = claimAddress.balance;

        uint256 timelock = block.number;
        uint256 prepayAmount = 2 gwei;

        token.approve(address(swap), lockupAmount);

        vm.expectEmit(true, true, false, true, address(swap));
        emit Lockup(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock);

        swap.lockPrepayMinerfee{value: prepayAmount}(
            preimageHash, lockupAmount, address(token), payable(claimAddress), timelock
        );

        assertTrue(querySwap(timelock));
        assertEq(claimAddress.balance, claimEthBalanceBefore + prepayAmount);
    }

    function lock(uint256 timelock) internal {
        swap.lock(preimageHash, lockupAmount, address(token), claimAddress, timelock);
    }

    function querySwap(uint256 timelock) internal view returns (bool) {
        return
            swap.swaps(
                swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock)
            );
    }

    function generateClaimSignature(uint256 timelock) internal view returns (uint8, bytes32, bytes32) {
        return vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashErc20SwapClaim(
                    swap.TYPEHASH_CLAIM(), preimage, lockupAmount, address(token), address(this), timelock, DESTINATION
                )
            )
        );
    }

    function generateCommitSignature(bytes32 _preimageHash, uint256 _amount, uint256 _timelock)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 message = sigUtils.getTypedDataHash(
            sigUtils.hashErc20SwapCommit(
                swap.TYPEHASH_COMMIT(), _preimageHash, _amount, address(token), claimAddress, refundAddress, _timelock
            )
        );

        return vm.sign(refundAddressKey, message);
    }

    function generateRefundSignature(uint256 _timelock) internal view returns (uint8, bytes32, bytes32) {
        bytes32 refundHash = sigUtils.hashErc20SwapRefund(
            swap.TYPEHASH_REFUND(), preimageHash, lockupAmount, address(token), claimAddress, _timelock
        );
        bytes32 digest = sigUtils.getTypedDataHash(refundHash);
        return vm.sign(claimAddressKey, digest);
    }
}
