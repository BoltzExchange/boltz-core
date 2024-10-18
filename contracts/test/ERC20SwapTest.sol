// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "./SigUtils.sol";
import "../BadERC20.sol";
import "../ERC20Swap.sol";
import "../TestERC20.sol";

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

    uint256 internal mintAmount = lockupAmount * 2;

    IERC20 internal token = new TestERC20("TestERC20", "TRC", 18, mintAmount);

    SigUtils internal sigUtils;

    function setUp() public {
        claimAddress = vm.addr(claimAddressKey);
        sigUtils = new SigUtils(swap.DOMAIN_SEPARATOR(), swap.TYPEHASH_REFUND());
    }

    function testCorrectVersion() external view {
        assertEq(swap.version(), 3);
    }

    function testShouldNotAcceptEther() external {
        (bool success,) = address(swap).call{value: 1}("");
        require(!success);
    }

    function testHashSwapValues() external view {
        uint256 timelock = block.number;

        assertEq(
            swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock),
            keccak256(
                abi.encodePacked(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock)
            )
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

    function testRefundCooperativeFail() external {
        uint256 timelock = block.number + 21;

        token.approve(address(swap), lockupAmount);
        lock(timelock);

        uint256 balanceBeforeRefund = token.balanceOf(address(this));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashERC20SwapRefund(preimageHash, lockupAmount, address(token), claimAddress, timelock)
            )
        );

        vm.expectEmit(true, false, false, false, address(swap));
        emit Refund(preimageHash);

        swap.refundCooperative(preimageHash, lockupAmount, address(token), claimAddress, timelock, v, r, s);

        assertFalse(querySwap(timelock));

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
        return swap.swaps(
            swap.hashValues(preimageHash, lockupAmount, address(token), claimAddress, address(this), timelock)
        );
    }
}
