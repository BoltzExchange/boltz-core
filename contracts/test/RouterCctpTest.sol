// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Router} from "../Router.sol";
import {TestERC20} from "../TestERC20.sol";
import {MockTarget, MockTokenMessengerV2, RouterTestBase} from "./RouterTestBase.sol";

contract RouterCctpTest is RouterTestBase {
    function testExecuteCctp() public {
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        require(token.transfer(address(ROUTER), lockupAmount));

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 11)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));

        ROUTER.executeCctp(calls, address(token), address(tokenMessenger), cctpData, lockupAmount);

        assertEq(mockTarget.calls(), 11);
        assertEq(tokenMessenger.lastSender(), address(ROUTER));
        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(tokenMessenger.lastDestinationDomain(), cctpData.destinationDomain);
        assertEq(tokenMessenger.lastMintRecipient(), cctpData.mintRecipient);
        assertEq(tokenMessenger.lastBurnToken(), address(token));
        assertEq(tokenMessenger.lastDestinationCaller(), cctpData.destinationCaller);
        assertEq(tokenMessenger.lastMaxFee(), cctpData.maxFee);
        assertEq(tokenMessenger.lastMinFinalityThreshold(), cctpData.minFinalityThreshold);
        assertEq(tokenMessenger.lastHookData(), bytes(""));
        assertEq(tokenMessenger.lastUsedHook(), false);
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testExecuteCctpWithHook() public {
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        require(token.transfer(address(ROUTER), lockupAmount));

        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(hex"1234");

        ROUTER.executeCctp(calls, address(token), address(tokenMessenger), cctpData, lockupAmount);

        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(tokenMessenger.lastHookData(), cctpData.hookData);
        assertEq(tokenMessenger.lastUsedHook(), true);
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testExecuteCctpUsesRemainingBalance() public {
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        require(token.transfer(address(ROUTER), lockupAmount));

        uint256 spentAmount = lockupAmount / 3;
        address recipient = address(0xCAFE);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(token),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", recipient, spentAmount)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        uint256 minAmount = lockupAmount - spentAmount;

        ROUTER.executeCctp(calls, address(token), address(tokenMessenger), cctpData, minAmount);

        assertEq(token.balanceOf(recipient), spentAmount);
        assertEq(tokenMessenger.lastAmount(), minAmount);
        assertEq(token.balanceOf(address(tokenMessenger)), minAmount);
    }

    function testExecuteCctpWithEthCalls() public {
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        require(token.transfer(address(ROUTER), lockupAmount));

        MockTarget mockTarget = new MockTarget();
        uint256 ethAmount = 0.05 ether;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: ethAmount,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 7)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));

        ROUTER.executeCctp{value: ethAmount}(calls, address(token), address(tokenMessenger), cctpData, lockupAmount);

        assertEq(mockTarget.calls(), 7);
        assertEq(address(mockTarget).balance, ethAmount);
        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testExecuteCctpRevertsBelowMinAmount() public {
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        require(token.transfer(address(ROUTER), lockupAmount));

        uint256 spentAmount = lockupAmount / 3;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(token),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", address(0xCAFE), spentAmount)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));

        vm.expectRevert(abi.encodeWithSelector(Router.InsufficientBalance.selector));
        ROUTER.executeCctp(calls, address(token), address(tokenMessenger), cctpData, lockupAmount);
    }

    function testClaimERC20ExecuteCctpSignature() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        executeClaimCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);

        assertEq(mockTarget.calls(), 3);
        assertEq(tokenMessenger.lastSender(), address(ROUTER));
        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(tokenMessenger.lastBurnToken(), address(token));
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testClaimERC20ExecuteCctpSignatureWithHook() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(hex"1234");
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        executeClaimCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);

        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(tokenMessenger.lastHookData(), cctpData.hookData);
        assertEq(tokenMessenger.lastUsedHook(), true);
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testClaimERC20ExecuteCctpSignatureWithEthCalls() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);

        MockTarget mockTarget = new MockTarget();
        uint256 ethAmount = 0.05 ether;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget),
            value: ethAmount,
            callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 5)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        ROUTER.claimERC20ExecuteCctp{value: ethAmount}(
            claim, calls, address(token), address(tokenMessenger), cctpData, auth
        );

        assertEq(mockTarget.calls(), 5);
        assertEq(address(mockTarget).balance, ethAmount);
        assertEq(tokenMessenger.lastAmount(), lockupAmount);
        assertEq(token.balanceOf(address(tokenMessenger)), lockupAmount);
    }

    function testClaimERC20ExecuteCctpSignatureUsesRemainingBalance() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);

        uint256 spentAmount = lockupAmount / 3;
        address recipient = address(0xCAFE);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(token),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", recipient, spentAmount)
        });

        uint256 minAmount = lockupAmount - spentAmount;
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, minAmount);

        executeClaimCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);

        assertEq(token.balanceOf(recipient), spentAmount);
        assertEq(tokenMessenger.lastAmount(), minAmount);
        assertEq(token.balanceOf(address(tokenMessenger)), minAmount);
    }

    function testClaimERC20ExecuteCctpSignatureRevertsBelowMinAmount() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);

        uint256 spentAmount = lockupAmount / 3;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(token),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", address(0xCAFE), spentAmount)
        });

        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        vm.expectRevert(abi.encodeWithSelector(Router.InsufficientBalance.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalid() public {
        uint256 wrongKey = 0xBAD;
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(wrongKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidTokenMessengerMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        MockTokenMessengerV2 otherTokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(otherTokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidTokenMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        TestERC20 otherToken = new TestERC20("Other CCTP", "OCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(otherToken), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidDestinationDomainMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.destinationDomain += 1;

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidMintRecipientMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.mintRecipient = bytes32(uint256(uint160(address(0xFEED))));

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidDestinationCallerMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.destinationCaller = bytes32(uint256(uint160(address(0xFEED))));

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidMaxFeeMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.maxFee += 1;

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidMinFinalityThresholdMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.minFinalityThreshold += 1;

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidDataMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        cctpData.hookData = hex"9999";

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(claim, calls, address(token), address(tokenMessenger), cctpData, auth);
    }

    function testClaimERC20ExecuteCctpSignatureInvalidMinAmountMutation() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock CCTP", "MCCTP", 18, lockupAmount * 10);
        MockTokenMessengerV2 tokenMessenger = new MockTokenMessengerV2();
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.CctpData memory cctpData = defaultCctpData(bytes(""));
        Router.ClaimCctpAuthorization memory auth =
            signClaimCctp(claimAddressKey, address(token), address(tokenMessenger), cctpData, lockupAmount);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteCctp(
            claim,
            calls,
            address(token),
            address(tokenMessenger),
            cctpData,
            Router.ClaimCctpAuthorization({minAmount: lockupAmount - 1, v: auth.v, r: auth.r, s: auth.s})
        );
    }
}
