// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {Router} from "../Router.sol";
import {SigUtils} from "./SigUtils.sol";
import {EtherSwap} from "../EtherSwap.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
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

contract MockERC20Dex {
    TestERC20 internal immutable INPUT_TOKEN;
    TestERC20 internal immutable OUTPUT_TOKEN;

    constructor(TestERC20 inputToken, TestERC20 outputToken) {
        INPUT_TOKEN = inputToken;
        OUTPUT_TOKEN = outputToken;
    }

    function swap(uint256 amount) public {
        require(INPUT_TOKEN.transferFrom(msg.sender, address(this), amount));
        require(OUTPUT_TOKEN.transfer(msg.sender, amount));
    }
}

contract MockERC20Target {
    TestERC20 internal immutable TOKEN;
    uint256 public calls;

    constructor(TestERC20 token) {
        TOKEN = token;
    }

    function mockTarget(uint256 value) public {
        require(TOKEN.transferFrom(msg.sender, address(this), value));
        calls += value;
    }

    function revertTarget() public pure {
        revert("revert");
    }
}

contract RouterTest is Test {
    EtherSwap internal immutable SWAP = new EtherSwap();
    ERC20Swap internal immutable ERC20_SWAP = new ERC20Swap();
    Router internal immutable ROUTER = new Router(address(SWAP), address(ERC20_SWAP));
    SigUtils internal immutable SIG_UTILS = new SigUtils(SWAP.DOMAIN_SEPARATOR());
    SigUtils internal immutable ERC20_SIG_UTILS;
    TestERC20 internal immutable TOKEN;
    TestERC20 internal immutable OUTPUT_TOKEN;

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress;

    constructor() {
        claimAddress = vm.addr(claimAddressKey);
        ERC20_SIG_UTILS = new SigUtils(ERC20_SWAP.DOMAIN_SEPARATOR());
        TOKEN = new TestERC20("Test", "TEST", 18, lockupAmount * 10);
        OUTPUT_TOKEN = new TestERC20("Output", "OUT", 18, lockupAmount * 10);
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

    function testClaimERC20Execute() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        uint256 balanceBefore = TOKEN.balanceOf(claimAddress);

        vm.prank(claimAddress);
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount);

        assertEq(mockTarget.calls(), 3);
        assertEq(TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimERC20ExecuteEntireBalance() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        uint256 balanceBefore = TOKEN.balanceOf(claimAddress);

        vm.prank(claimAddress);
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount - 21);

        assertEq(mockTarget.calls(), 3);
        assertEq(TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimERC20ExecuteMultiple() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](2);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });
        calls[1] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 18)
        });

        uint256 balanceBefore = TOKEN.balanceOf(claimAddress);

        vm.prank(claimAddress);
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount);

        assertEq(mockTarget.calls(), 21);
        assertEq(TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimERC20ExecuteSwapTokens() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        // Setup DEX that swaps TOKEN -> OUTPUT_TOKEN
        MockERC20Dex dex = new MockERC20Dex(TOKEN, OUTPUT_TOKEN);
        require(OUTPUT_TOKEN.transfer(address(dex), lockupAmount));

        // Router needs to approve the DEX to spend TOKEN
        Router.Call[] memory calls = new Router.Call[](2);
        // First call: approve DEX
        calls[0] = Router.Call({
            target: address(TOKEN),
            value: 0,
            callData: abi.encodeWithSelector(TOKEN.approve.selector, address(dex), lockupAmount)
        });
        // Second call: swap
        calls[1] = Router.Call({
            target: address(dex), value: 0, callData: abi.encodeWithSelector(MockERC20Dex.swap.selector, lockupAmount)
        });

        uint256 balanceBefore = OUTPUT_TOKEN.balanceOf(claimAddress);

        vm.prank(claimAddress);
        ROUTER.claimERC20Execute(claim, calls, address(OUTPUT_TOKEN), lockupAmount);

        assertEq(OUTPUT_TOKEN.balanceOf(claimAddress) - balanceBefore, lockupAmount);
    }

    function testClaimERC20ExecuteClaimInvalidAddress() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), 0);
    }

    function testClaimERC20ExecuteCallFailed() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.revertTarget.selector)
        });

        vm.prank(claimAddress);
        vm.expectRevert(abi.encodeWithSelector(Router.CallFailed.selector, 0));
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), 0);
    }

    function testClaimERC20ExecuteInsufficientBalance() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        vm.prank(claimAddress);
        vm.expectRevert(Router.InsufficientBalance.selector);
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount + 1);
    }

    function testClaimERC20ExecuteSignature() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

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
                    keccak256(abi.encode(ROUTER.TYPEHASH_CLAIM(), preimage, address(TOKEN), lockupAmount, destination))
                )
            )
        );

        vm.prank(claimAddress);
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount, destination, v, r, s);

        assertEq(mockTarget.calls(), 3);
        assertEq(TOKEN.balanceOf(destination), lockupAmount);
    }

    function testClaimERC20ExecuteSignatureInvalid() public {
        uint256 wrongKey = 0xBAD;
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        Router.Call[] memory calls = new Router.Call[](0);
        address destination = 0x3DdB7340B5657C37a338D83c99Bb72151ef9cBB0;

        // Sign with wrong key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            wrongKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    ROUTER.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(ROUTER.TYPEHASH_CLAIM(), preimage, address(TOKEN), lockupAmount, destination))
                )
            )
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20Execute(claim, calls, address(TOKEN), lockupAmount, destination, v, r, s);
    }

    function testClaimERC20Call() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        MockERC20Target mockTarget = new MockERC20Target(TOKEN);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        uint256 balanceBefore = TOKEN.balanceOf(address(mockTarget));

        vm.prank(claimAddress);
        ROUTER.claimERC20Call(
            claim, address(mockTarget), abi.encodeWithSelector(MockERC20Target.mockTarget.selector, lockupAmount)
        );

        assertEq(mockTarget.calls(), lockupAmount);
        assertEq(TOKEN.balanceOf(address(mockTarget)) - balanceBefore, lockupAmount);
    }

    function testClaimERC20CallInvalidCaller() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        MockERC20Target mockTarget = new MockERC20Target(TOKEN);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20Call(
            claim, address(mockTarget), abi.encodeWithSelector(MockERC20Target.mockTarget.selector, lockupAmount)
        );
    }

    function testClaimERC20CallRevert() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        MockERC20Target mockTarget = new MockERC20Target(TOKEN);

        Router.Erc20Claim memory claim = signErc20Claim(timelock);

        vm.prank(claimAddress);
        vm.expectRevert(abi.encodeWithSelector(Router.CallFailed.selector, 0));
        ROUTER.claimERC20Call(claim, address(mockTarget), abi.encodeWithSelector(MockERC20Target.revertTarget.selector));
    }

    function testClaimERC20CallSignature() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        MockERC20Target mockTarget = new MockERC20Target(TOKEN);

        bytes memory data = abi.encodeWithSelector(MockERC20Target.mockTarget.selector, lockupAmount);

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

        uint256 balanceBefore = TOKEN.balanceOf(address(mockTarget));

        ROUTER.claimERC20Call(signErc20Claim(timelock), address(mockTarget), data, v, r, s);

        assertEq(mockTarget.calls(), lockupAmount);
        assertEq(TOKEN.balanceOf(address(mockTarget)) - balanceBefore, lockupAmount);
    }

    function testClaimERC20CallSignatureInvalid() public {
        uint256 timelock = block.number + 21;
        lockERC20Swap(timelock);

        MockERC20Target mockTarget = new MockERC20Target(TOKEN);

        // Sign with different calldata
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
                            keccak256(abi.encodeWithSelector(MockERC20Target.mockTarget.selector, lockupAmount + 1))
                        )
                    )
                )
            )
        );

        Router.Erc20Claim memory claimSignature = signErc20Claim(timelock);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20Call(
            claimSignature,
            address(mockTarget),
            abi.encodeWithSelector(MockERC20Target.mockTarget.selector, lockupAmount),
            v,
            r,
            s
        );
    }

    function lockERC20Swap(uint256 timelock) internal {
        TOKEN.approve(address(ERC20_SWAP), lockupAmount);
        ERC20_SWAP.lock(preimageHash, lockupAmount, address(TOKEN), claimAddress, timelock);
    }

    function signErc20Claim(uint256 timelock) internal view returns (Router.Erc20Claim memory) {
        bytes32 message = ERC20_SIG_UTILS.hashErc20SwapClaim(
            ERC20_SWAP.TYPEHASH_CLAIM(),
            preimage,
            lockupAmount,
            address(TOKEN),
            address(this),
            timelock,
            address(ROUTER)
        );
        bytes32 digest = ERC20_SIG_UTILS.getTypedDataHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimAddressKey, digest);

        return Router.Erc20Claim({
            preimage: preimage,
            amount: lockupAmount,
            tokenAddress: address(TOKEN),
            refundAddress: address(this),
            timelock: timelock,
            v: v,
            r: r,
            s: s
        });
    }
}
