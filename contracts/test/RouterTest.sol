// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {Router} from "../Router.sol";
import {SigUtils} from "./SigUtils.sol";
import {EtherSwap} from "../EtherSwap.sol";
import {ERC20Swap} from "../ERC20Swap.sol";
import {ISignatureTransfer} from "permit2/interfaces/ISignatureTransfer.sol";
import {TestERC20} from "../TestERC20.sol";
import {DeployPermit2} from "../../solidity-lib/permit2/test/utils/DeployPermit2.sol";

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
    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    string internal constant PERMIT2_WITNESS_TYPEHASH_STUB =
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,";

    EtherSwap internal immutable SWAP;
    ERC20Swap internal immutable ERC20_SWAP;
    ISignatureTransfer internal immutable PERMIT2;
    Router internal immutable ROUTER;
    SigUtils internal immutable SIG_UTILS;
    SigUtils internal immutable ERC20_SIG_UTILS;
    TestERC20 internal immutable TOKEN;
    TestERC20 internal immutable OUTPUT_TOKEN;

    bytes32 internal preimage = sha256("");
    bytes32 internal preimageHash = sha256(abi.encodePacked(preimage));
    uint256 internal lockupAmount = 1 ether;
    uint256 internal claimAddressKey = 0xA11CE;
    address internal claimAddress;
    uint256 internal refundAddressKey = 0xB0B;
    address internal refundAddress;

    constructor() {
        claimAddress = vm.addr(claimAddressKey);
        refundAddress = vm.addr(refundAddressKey);
        SWAP = new EtherSwap();
        ERC20_SWAP = new ERC20Swap();
        PERMIT2 = ISignatureTransfer(new DeployPermit2().deployPermit2());
        ROUTER = new Router(address(SWAP), address(ERC20_SWAP), address(PERMIT2));
        SIG_UTILS = new SigUtils(SWAP.DOMAIN_SEPARATOR());
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

    function testExecuteAndLockEther() public {
        uint256 timelock = block.number + 21;

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 7)
        });

        ROUTER.executeAndLock{value: lockupAmount}(preimageHash, claimAddress, address(this), timelock, calls);

        bytes32 hash = SWAP.hashValues(preimageHash, lockupAmount, claimAddress, address(this), timelock);
        assertTrue(SWAP.swaps(hash));
        assertEq(mockTarget.calls(), 7);
        assertEq(address(ROUTER).balance, 0);
    }

    function testExecuteAndLockERC20() public {
        uint256 timelock = block.number + 21;

        MockDex dex = new MockDex(TOKEN);
        require(TOKEN.transfer(address(dex), lockupAmount));

        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(dex), value: lockupAmount, callData: abi.encodeWithSelector(MockDex.swap.selector)
        });

        ROUTER.executeAndLockERC20{value: lockupAmount}(
            preimageHash, address(TOKEN), claimAddress, address(this), timelock, calls
        );

        bytes32 hash =
            ERC20_SWAP.hashValues(preimageHash, lockupAmount, address(TOKEN), claimAddress, address(this), timelock);
        assertTrue(ERC20_SWAP.swaps(hash));
        assertEq(TOKEN.balanceOf(address(ROUTER)), 0);
    }

    function testExecuteAndLockERC20WithPermit2() public {
        uint256 timelock = block.number + 21;

        require(TOKEN.transfer(refundAddress, lockupAmount));

        Router.Call[] memory calls = new Router.Call[](0);
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(TOKEN), amount: lockupAmount}),
            nonce: 0,
            deadline: block.timestamp + 100
        });

        bytes32 callsHash = keccak256(abi.encode(calls));
        bytes32 witness = keccak256(
            abi.encode(
                ROUTER.TYPEHASH_EXECUTE_LOCK_ERC20(),
                preimageHash,
                address(TOKEN),
                claimAddress,
                refundAddress,
                timelock,
                callsHash
            )
        );
        bytes memory signature = signPermit2WitnessTransfer(permit, witness, refundAddressKey);

        vm.startPrank(refundAddress);
        require(TOKEN.approve(address(PERMIT2), lockupAmount));
        ROUTER.executeAndLockERC20WithPermit2(
            preimageHash, address(TOKEN), claimAddress, refundAddress, timelock, calls, permit, signature
        );
        vm.stopPrank();

        bytes32 hash =
            ERC20_SWAP.hashValues(preimageHash, lockupAmount, address(TOKEN), claimAddress, refundAddress, timelock);
        assertTrue(ERC20_SWAP.swaps(hash));
        assertEq(TOKEN.balanceOf(address(ROUTER)), 0);
        assertEq(TOKEN.balanceOf(refundAddress), 0);
    }

    function testExecuteAndLockERC20WithPermit2InvalidSignature() public {
        uint256 timelock = block.number + 21;

        require(TOKEN.transfer(refundAddress, lockupAmount));

        Router.Call[] memory calls = new Router.Call[](0);
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(TOKEN), amount: lockupAmount}),
            nonce: 0,
            deadline: block.timestamp + 100
        });

        bytes32 callsHash = keccak256(abi.encode(calls));
        bytes32 witness = keccak256(
            abi.encode(
                ROUTER.TYPEHASH_EXECUTE_LOCK_ERC20(),
                preimageHash,
                address(TOKEN),
                claimAddress,
                refundAddress,
                timelock,
                callsHash
            )
        );
        bytes memory signature = signPermit2WitnessTransfer(permit, witness, refundAddressKey);
        signature[0] ^= 0x01;

        vm.startPrank(refundAddress);
        require(TOKEN.approve(address(PERMIT2), lockupAmount));
        vm.expectRevert();
        ROUTER.executeAndLockERC20WithPermit2(
            preimageHash, address(TOKEN), claimAddress, refundAddress, timelock, calls, permit, signature
        );
        vm.stopPrank();
    }

    function signPermit2WitnessTransfer(
        ISignatureTransfer.PermitTransferFrom memory permit,
        bytes32 witness,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 typehash = keccak256(
            abi.encodePacked(PERMIT2_WITNESS_TYPEHASH_STUB, ROUTER.TYPESTRING_EXECUTE_LOCK_ERC20())
        );
        bytes32 tokenPermissionsHash = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted));
        bytes32 msgHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                PERMIT2.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(typehash, tokenPermissionsHash, address(ROUTER), permit.nonce, permit.deadline, witness)
                )
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, msgHash);
        return bytes.concat(r, s, bytes1(v));
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
