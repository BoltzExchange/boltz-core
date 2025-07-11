// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../Router.sol";
import "./SigUtils.sol";
import "../EtherSwap.sol";
import "../TestERC20.sol";

contract MockTarget {
    uint256 public calls;

    function mockTarget(uint256 value) public {
        calls += value;
    }

    function revertTarget() public pure {
        revert("revert");
    }
}

contract MockDex {
    TestERC20 internal immutable token;

    constructor(TestERC20 _token) {
        token = _token;
    }

    function swap() public payable {
        token.transfer(msg.sender, msg.value);
    }
}

contract RouterTest is Test {
    EtherSwap internal immutable swap = new EtherSwap();
    Router internal immutable router = new Router(address(swap));
    SigUtils internal immutable sigUtils = new SigUtils(swap.DOMAIN_SEPARATOR());
    TestERC20 internal immutable token;

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress = vm.addr(claimAddressKey);

    constructor() {
        token = new TestERC20("Test", "TEST", 18, lockupAmount);
    }

    receive() external payable {}

    function testClaimExecute() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(0), lockupAmount);

        assertEq(mockTarget.calls(), 3);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteEntireBalance() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(0), lockupAmount - 21);

        assertEq(mockTarget.calls(), 3);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteMultiple() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](2);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });
        calls[1] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 18)
        });

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(0), lockupAmount);

        assertEq(mockTarget.calls(), 21);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteToken() public {
        uint256 balanceBefore = token.balanceOf(claimAddress);

        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(token);
        token.transfer(address(dex), lockupAmount);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex),
            value: lockupAmount,
            callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(token), lockupAmount);

        assertEq(token.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimExecuteTokenEntireBalance() public {
        uint256 balanceBefore = token.balanceOf(claimAddress);

        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(token);
        token.transfer(address(dex), lockupAmount);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex),
            value: lockupAmount,
            callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(token), lockupAmount - 21);

        assertEq(token.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimExecuteClaimInvalidAddress() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        router.claimExecute(claim, calls, address(0), 0);
    }

    function testClaimExecuteInvalidTarget() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(swap),
            value: 0,
            callData: abi.encodeWithSelector(EtherSwap.claimBatch.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(abi.encodeWithSelector(Router.InvalidTarget.selector));
        router.claimExecute(claim, calls, address(0), 0);
    }

    function testClaimExecuteCallFailed() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.revertTarget.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(abi.encodeWithSelector(Router.CallFailed.selector, 0));
        router.claimExecute(claim, calls, address(0), 0);
    }

    function testClaimExecuteInsufficientBalance() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        vm.expectRevert(Router.InsufficientBalance.selector);
        router.claimExecute(claim, calls, address(0), lockupAmount + 1);
    }

    function testClaimExecuteInsufficientBalanceToken() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(token);
        token.transfer(address(dex), lockupAmount);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex),
            value: lockupAmount,
            callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(Router.InsufficientBalance.selector);
        router.claimExecute(claim, calls, address(token), lockupAmount + 1);
    }

    function testClaimExecuteSignature() public {
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: 0,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        address destination = 0x3DdB7340B5657C37a338D83c99Bb72151ef9cBB0;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    router.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(router.TYPEHASH_CLAIM(), preimage, address(0), lockupAmount, destination))
                )
            )
        );

        vm.prank(claimAddress);
        router.claimExecute(claim, calls, address(0), lockupAmount, destination, v, r, s);

        assertEq(mockTarget.calls(), 3);
        assertEq(destination.balance, lockupAmount);
    }

    function testClaimExecuteSignatureInvalid() public {
        uint256 wrongKey = 0xBAD;
        uint256 timelock = block.number + 21;
        swap.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        Router.Call[] memory calls = new Router.Call[](0);
        address destination = 0x3DdB7340B5657C37a338D83c99Bb72151ef9cBB0;

        // Sign with wrong key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            wrongKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    router.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(router.TYPEHASH_CLAIM(), preimage, address(0), lockupAmount, destination))
                )
            )
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        router.claimExecute(claim, calls, address(0), lockupAmount, destination, v, r, s);
    }

    function signClaim(uint256 timelock) internal view returns (Router.Claim memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            sigUtils.getTypedDataHash(
                sigUtils.hashEtherSwapClaim(
                    swap.TYPEHASH_CLAIM(), preimage, lockupAmount, address(this), timelock, address(router)
                )
            )
        );

        return Router.Claim({
            preimage: preimage,
            amount: lockupAmount,
            refundAddress: address(this),
            timelock: timelock,
            v: v,
            r: r,
            s: s
        });
    }
}
