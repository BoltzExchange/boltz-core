// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Router} from "../Router.sol";
import {SigUtils} from "./SigUtils.sol";
import {EtherSwap} from "../EtherSwap.sol";
import {TestERC20} from "../TestERC20.sol";

contract MockTarget {
    uint256 public calls;

    function mockTarget(uint256 value) public payable {
        calls += value;
    }

    function revertTarget() public pure {
        revert("revert");
    }
}

contract MockDex {
    TestERC20 internal immutable TOKEN;

    constructor(TestERC20 token) {
        TOKEN = token;
    }

    function swap() public payable {
        require(TOKEN.transfer(msg.sender, msg.value));
    }
}

contract RouterTest is Test {
    EtherSwap internal immutable SWAP = new EtherSwap();
    Router internal immutable ROUTER = new Router(address(SWAP));
    SigUtils internal immutable SIG_UTILS = new SigUtils(SWAP.DOMAIN_SEPARATOR());
    TestERC20 internal immutable TOKEN;

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress = vm.addr(claimAddressKey);

    constructor() {
        TOKEN = new TestERC20("Test", "TEST", 18, lockupAmount);
    }

    receive() external payable {}

    function testClaimExecute() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount);

        assertEq(mockTarget.calls(), 3);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteEntireBalance() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount - 21);

        assertEq(mockTarget.calls(), 3);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteMultiple() public {
        uint256 balanceBefore = claimAddress.balance;

        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](2);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });
        calls[1] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 18)
        });

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount);

        assertEq(mockTarget.calls(), 21);
        assertEq(claimAddress.balance - balanceBefore, lockupAmount);
    }

    function testClaimExecuteToken() public {
        uint256 balanceBefore = TOKEN.balanceOf(claimAddress);

        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(TOKEN);
        require(TOKEN.transfer(address(dex), lockupAmount));
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex), value: lockupAmount, callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(TOKEN), lockupAmount);

        assertEq(TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimExecuteTokenEntireBalance() public {
        uint256 balanceBefore = TOKEN.balanceOf(claimAddress);

        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(TOKEN);
        require(TOKEN.transfer(address(dex), lockupAmount));
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex), value: lockupAmount, callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(TOKEN), lockupAmount - 21);

        assertEq(TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimExecuteClaimInvalidAddress() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimExecute(claim, calls, address(0), 0);
    }

    function testClaimExecuteCallFailed() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.revertTarget.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(abi.encodeWithSelector(Router.CallFailed.selector, 0));
        ROUTER.claimExecute(claim, calls, address(0), 0);
    }

    function testClaimExecuteInsufficientBalance() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        vm.expectRevert(Router.InsufficientBalance.selector);
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount + 1);
    }

    function testClaimExecuteInsufficientBalanceToken() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockDex dex = new MockDex(TOKEN);
        require(TOKEN.transfer(address(dex), lockupAmount));
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex), value: lockupAmount, callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(Router.InsufficientBalance.selector);
        ROUTER.claimExecute(claim, calls, address(TOKEN), lockupAmount + 1);
    }

    function testClaimExecuteSignature() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        address destination = 0x3DdB7340B5657C37a338D83c99Bb72151ef9cBB0;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    ROUTER.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(ROUTER.TYPEHASH_CLAIM(), preimage, address(0), lockupAmount, destination))
                )
            )
        );

        vm.prank(claimAddress);
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount, destination, v, r, s);

        assertEq(mockTarget.calls(), 3);
        assertEq(destination.balance, lockupAmount);
    }

    function testClaimExecuteSignatureInvalid() public {
        uint256 wrongKey = 0xBAD;
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        Router.Claim memory claim = signClaim(timelock);

        Router.Call[] memory calls = new Router.Call[](0);
        address destination = 0x3DdB7340B5657C37a338D83c99Bb72151ef9cBB0;

        // Sign with wrong key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            wrongKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    SWAP.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(SWAP.TYPEHASH_CLAIM(), preimage, address(0), lockupAmount, destination))
                )
            )
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimExecute(claim, calls, address(0), lockupAmount, destination, v, r, s);
    }

    function testClaimCall() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        MockTarget mockTarget = new MockTarget();

        Router.Claim memory claim = signClaim(timelock);

        vm.prank(claimAddress);
        ROUTER.claimCall(claim, address(mockTarget), abi.encodeWithSelector(MockTarget.mockTarget.selector, 21));

        assertEq(mockTarget.calls(), 21);
        assertEq(address(mockTarget).balance, lockupAmount);
    }

    function testClaimCallInvalidCaller() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        MockTarget mockTarget = new MockTarget();

        Router.Claim memory claim = signClaim(timelock);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimCall(claim, address(mockTarget), abi.encodeWithSelector(MockTarget.mockTarget.selector, 21));
    }

    function testClaimCallSignature() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        MockTarget mockTarget = new MockTarget();

        bytes memory data = abi.encodeWithSelector(MockTarget.mockTarget.selector, 21);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    ROUTER.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(ROUTER.TYPEHASH_CLAIM_CALL(), preimage, address(mockTarget), keccak256(data)))
                )
            )
        );

        ROUTER.claimCall(signClaim(timelock), address(mockTarget), data, v, r, s);

        assertEq(mockTarget.calls(), 21);
        assertEq(address(mockTarget).balance, lockupAmount);
    }

    function testClaimCallSignatureInvalid() public {
        uint256 timelock = block.number + 21;
        SWAP.lock{value: lockupAmount}(preimageHash, claimAddress, timelock);

        MockTarget mockTarget = new MockTarget();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    ROUTER.DOMAIN_SEPARATOR(),
                    keccak256(
                        abi.encode(
                            ROUTER.TYPEHASH_CLAIM_CALL(),
                            preimage,
                            address(mockTarget),
                            keccak256(abi.encodeWithSelector(MockTarget.mockTarget.selector, 22))
                        )
                    )
                )
            )
        );

        Router.Claim memory claimSignature = signClaim(timelock);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimCall(
            claimSignature, address(mockTarget), abi.encodeWithSelector(MockTarget.mockTarget.selector, 21), v, r, s
        );
    }

    function signClaim(uint256 timelock) internal view returns (Router.Claim memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            claimAddressKey,
            SIG_UTILS.getTypedDataHash(
                SIG_UTILS.hashEtherSwapClaim(
                    SWAP.TYPEHASH_CLAIM(), preimage, lockupAmount, address(this), timelock, address(ROUTER)
                )
            )
        );

        return Router.Claim({
            preimage: preimage, amount: lockupAmount, refundAddress: address(this), timelock: timelock, v: v, r: r, s: s
        });
    }
}
