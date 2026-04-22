// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Router} from "../Router.sol";
import {TestERC20} from "../TestERC20.sol";
import {MockOFT, MockOFTAdapter, MockTarget, RouterTestBase} from "./RouterTestBase.sol";

contract RouterOftTest is RouterTestBase {
    function testExecuteOft() public {
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        require(oft.transfer(address(ROUTER), lockupAmount));

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 11)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        ROUTER.executeOft{value: nativeFee}(
            calls, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        assertEq(mockTarget.calls(), 11);
        assertEq(oft.lastSender(), address(ROUTER));
        assertEq(oft.lastDstEid(), sendData.dstEid);
        assertEq(oft.lastTo(), sendData.to);
        assertEq(oft.lastAmountLD(), lockupAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(oft.lastExtraOptions(), sendData.extraOptions);
        assertEq(oft.lastComposeMsg(), sendData.composeMsg);
        assertEq(oft.lastOftCmd(), sendData.oftCmd);
        assertEq(oft.lastNativeFee(), nativeFee);
        assertEq(oft.lastLzTokenFee(), lzTokenFee);
        assertEq(oft.lastRefundAddress(), sendRefundAddress);
        assertEq(oft.lastMsgValue(), nativeFee);
        assertEq(oft.balanceOf(address(oft)), lockupAmount);
    }

    function testExecuteOftWithAdapter() public {
        TestERC20 token = new TestERC20("Mock OFT", "MOFT", 18, lockupAmount * 10);
        MockOFTAdapter oft = new MockOFTAdapter(token);
        require(token.transfer(address(ROUTER), lockupAmount));

        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(token),
            value: 0,
            callData: abi.encodeWithSignature("approve(address,uint256)", address(oft), type(uint256).max)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        ROUTER.executeOft{value: nativeFee}(
            calls, address(token), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        assertEq(oft.lastSender(), address(ROUTER));
        assertEq(oft.lastAmountLD(), lockupAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(token.balanceOf(address(oft)), lockupAmount);
    }

    function testExecuteOftUsesRemainingBalance() public {
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        require(oft.transfer(address(ROUTER), lockupAmount));

        uint256 spentAmount = lockupAmount / 3;
        address recipient = address(0xCAFE);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(oft),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", recipient, spentAmount)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount - spentAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        ROUTER.executeOft{value: nativeFee}(
            calls, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        assertEq(oft.balanceOf(recipient), spentAmount);
        assertEq(oft.lastAmountLD(), lockupAmount - spentAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(oft.balanceOf(address(oft)), lockupAmount - spentAmount);
    }

    function testExecuteOftRevertsBelowMinAmount() public {
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        require(oft.transfer(address(ROUTER), lockupAmount));

        uint256 spentAmount = lockupAmount / 3;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(oft),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", address(0xCAFE), spentAmount)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        vm.expectRevert(abi.encodeWithSelector(Router.InsufficientBalance.selector));
        ROUTER.executeOft{value: nativeFee}(
            calls, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );
    }

    function testClaimERC20ExecuteSendSignature() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);

        MockTarget mockTarget = new MockTarget();
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(mockTarget), value: 0, callData: abi.encodeWithSelector(MockTarget.mockTarget.selector, 3)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);
        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        executeClaimSend(claim, calls, address(oft), address(oft), sendData, nativeFee, auth);

        assertEq(mockTarget.calls(), 3);
        assertEq(oft.lastSender(), address(ROUTER));
        assertEq(oft.lastDstEid(), sendData.dstEid);
        assertEq(oft.lastTo(), sendData.to);
        assertEq(oft.lastAmountLD(), lockupAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(oft.lastExtraOptions(), sendData.extraOptions);
        assertEq(oft.lastComposeMsg(), sendData.composeMsg);
        assertEq(oft.lastOftCmd(), sendData.oftCmd);
        assertEq(oft.lastNativeFee(), nativeFee);
        assertEq(oft.lastLzTokenFee(), lzTokenFee);
        assertEq(oft.lastRefundAddress(), sendRefundAddress);
        assertEq(oft.lastMsgValue(), nativeFee);
        assertEq(oft.balanceOf(address(oft)), lockupAmount);
    }

    function testClaimERC20ExecuteSendSignatureWithAdapter() public {
        uint256 timelock = block.number + 21;
        TestERC20 token = new TestERC20("Mock OFT", "MOFT", 18, lockupAmount * 10);
        MockOFTAdapter oft = new MockOFTAdapter(token);
        lockERC20Swap(token, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(token, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);
        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(token), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        vm.prank(address(ROUTER));
        token.approve(address(oft), type(uint256).max);

        executeClaimSend(claim, calls, address(token), address(oft), sendData, nativeFee, auth);

        assertEq(oft.lastSender(), address(ROUTER));
        assertEq(oft.lastAmountLD(), lockupAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(token.balanceOf(address(oft)), lockupAmount);
    }

    function testClaimERC20ExecuteSendSignatureUsesRemainingBalance() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);

        uint256 spentAmount = lockupAmount / 3;
        address recipient = address(0xCAFE);
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(oft),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", recipient, spentAmount)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount - spentAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);
        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        executeClaimSend(claim, calls, address(oft), address(oft), sendData, nativeFee, auth);

        assertEq(oft.balanceOf(recipient), spentAmount);
        assertEq(oft.lastAmountLD(), lockupAmount - spentAmount);
        assertEq(oft.lastMinAmountLD(), minAmountLd);
        assertEq(oft.balanceOf(address(oft)), lockupAmount - spentAmount);
    }

    function testClaimERC20ExecuteSendSignatureRevertsBelowMinAmount() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);

        uint256 spentAmount = lockupAmount / 3;
        Router.Call[] memory calls = new Router.Call[](1);
        calls[0] = Router.Call({
            target: address(oft),
            value: 0,
            callData: abi.encodeWithSignature("transfer(address,uint256)", address(0xCAFE), spentAmount)
        });

        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        vm.expectRevert(abi.encodeWithSelector(Router.InsufficientBalance.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(claim, calls, address(oft), address(oft), sendData, auth);
    }

    function testClaimERC20ExecuteSendSignatureInvalid() public {
        uint256 wrongKey = 0xBAD;
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth =
            signClaimSend(wrongKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress);

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(claim, calls, address(oft), address(oft), sendData, auth);
    }

    function testClaimERC20ExecuteSendSignatureInvalidSendParamMutation() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        sendData.extraOptions = hex"4321";

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(claim, calls, address(oft), address(oft), sendData, auth);
    }

    function testClaimERC20ExecuteSendSignatureInvalidMinAmountMutation() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(
            claim,
            calls,
            address(oft),
            address(oft),
            sendData,
            Router.ClaimSendAuthorization({
                minAmountLd: minAmountLd - 1,
                lzTokenFee: auth.lzTokenFee,
                refundAddress: auth.refundAddress,
                v: auth.v,
                r: auth.r,
                s: auth.s
            })
        );
    }

    function testClaimERC20ExecuteSendSignatureInvalidFeeMutation() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 1;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(
            claim,
            calls,
            address(oft),
            address(oft),
            sendData,
            Router.ClaimSendAuthorization({
                minAmountLd: auth.minAmountLd,
                lzTokenFee: 2,
                refundAddress: auth.refundAddress,
                v: auth.v,
                r: auth.r,
                s: auth.s
            })
        );
    }

    function testClaimERC20ExecuteSendSignatureInvalidRefundAddressMutation() public {
        uint256 timelock = block.number + 21;
        MockOFT oft = new MockOFT("Mock OFT", "MOFT", 18, lockupAmount * 10);
        lockERC20Swap(oft, lockupAmount, timelock);

        Router.Erc20Claim memory claim = signErc20Claim(oft, lockupAmount, timelock);
        Router.Call[] memory calls = new Router.Call[](0);
        Router.SendData memory sendData = Router.SendData({
            dstEid: 30101,
            to: bytes32(uint256(uint160(claimAddress))),
            extraOptions: hex"1234",
            composeMsg: hex"5678",
            oftCmd: hex"9abc"
        });
        uint256 nativeFee = 0.01 ether;
        uint256 minAmountLd = lockupAmount;
        uint256 lzTokenFee = 0;
        address sendRefundAddress = address(0xBEEF);

        Router.ClaimSendAuthorization memory auth = signClaimSend(
            claimAddressKey, address(oft), address(oft), sendData, minAmountLd, lzTokenFee, sendRefundAddress
        );

        vm.expectRevert(abi.encodeWithSelector(Router.ClaimInvalidAddress.selector));
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(
            claim,
            calls,
            address(oft),
            address(oft),
            sendData,
            Router.ClaimSendAuthorization({
                minAmountLd: auth.minAmountLd,
                lzTokenFee: auth.lzTokenFee,
                refundAddress: address(0xFEED),
                v: auth.v,
                r: auth.r,
                s: auth.s
            })
        );
    }
}
