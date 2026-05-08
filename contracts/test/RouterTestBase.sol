// SPDX-License-Identifier: MIT

pragma solidity ^0.8.33;

import {Test} from "forge-std/Test.sol";
import {Router} from "../Router.sol";
import {OFT} from "../interfaces/OFT.sol";
import {ITokenMessengerV2} from "../interfaces/ITokenMessengerV2.sol";
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

contract MockOFT is TestERC20, OFT {
    address public lastSender;
    uint32 public lastDstEid;
    bytes32 public lastTo;
    // forge-lint: disable-next-item(mixed-case-variable)
    uint256 public lastAmountLD;
    // forge-lint: disable-next-item(mixed-case-variable)
    uint256 public lastMinAmountLD;
    bytes public lastExtraOptions;
    bytes public lastComposeMsg;
    bytes public lastOftCmd;
    uint256 public lastNativeFee;
    uint256 public lastLzTokenFee;
    address public lastRefundAddress;
    uint256 public lastMsgValue;

    constructor(string memory name, string memory symbol, uint8 initialDecimals, uint256 initialSupply)
        TestERC20(name, symbol, initialDecimals, initialSupply)
    {}

    function send(SendParam calldata _sendParam, MessagingFee calldata _fee, address _refundAddress)
        external
        payable
        override
        returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt)
    {
        _transfer(msg.sender, address(this), _sendParam.amountLD);

        lastSender = msg.sender;
        lastDstEid = _sendParam.dstEid;
        lastTo = _sendParam.to;
        lastAmountLD = _sendParam.amountLD;
        lastMinAmountLD = _sendParam.minAmountLD;
        lastExtraOptions = _sendParam.extraOptions;
        lastComposeMsg = _sendParam.composeMsg;
        lastOftCmd = _sendParam.oftCmd;
        lastNativeFee = _fee.nativeFee;
        lastLzTokenFee = _fee.lzTokenFee;
        lastRefundAddress = _refundAddress;
        lastMsgValue = msg.value;

        msgReceipt = MessagingReceipt({guid: bytes32(uint256(1)), nonce: 1, fee: _fee});
        oftReceipt = OFTReceipt({amountSentLD: _sendParam.amountLD, amountReceivedLD: _sendParam.minAmountLD});
    }
}

contract MockOFTAdapter is OFT {
    TestERC20 internal immutable TOKEN;

    address public lastSender;
    uint32 public lastDstEid;
    bytes32 public lastTo;
    // forge-lint: disable-next-item(mixed-case-variable)
    uint256 public lastAmountLD;
    // forge-lint: disable-next-item(mixed-case-variable)
    uint256 public lastMinAmountLD;
    bytes public lastExtraOptions;
    bytes public lastComposeMsg;
    bytes public lastOftCmd;
    uint256 public lastNativeFee;
    uint256 public lastLzTokenFee;
    address public lastRefundAddress;
    uint256 public lastMsgValue;

    constructor(TestERC20 token) {
        TOKEN = token;
    }

    function send(SendParam calldata _sendParam, MessagingFee calldata _fee, address _refundAddress)
        external
        payable
        override
        returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt)
    {
        require(TOKEN.transferFrom(msg.sender, address(this), _sendParam.amountLD));

        lastSender = msg.sender;
        lastDstEid = _sendParam.dstEid;
        lastTo = _sendParam.to;
        lastAmountLD = _sendParam.amountLD;
        lastMinAmountLD = _sendParam.minAmountLD;
        lastExtraOptions = _sendParam.extraOptions;
        lastComposeMsg = _sendParam.composeMsg;
        lastOftCmd = _sendParam.oftCmd;
        lastNativeFee = _fee.nativeFee;
        lastLzTokenFee = _fee.lzTokenFee;
        lastRefundAddress = _refundAddress;
        lastMsgValue = msg.value;

        msgReceipt = MessagingReceipt({guid: bytes32(uint256(1)), nonce: 1, fee: _fee});
        oftReceipt = OFTReceipt({amountSentLD: _sendParam.amountLD, amountReceivedLD: _sendParam.minAmountLD});
    }
}

contract MockTokenMessengerV2 is ITokenMessengerV2 {
    address public lastSender;
    uint256 public lastAmount;
    uint32 public lastDestinationDomain;
    bytes32 public lastMintRecipient;
    address public lastBurnToken;
    bytes32 public lastDestinationCaller;
    uint256 public lastMaxFee;
    uint32 public lastMinFinalityThreshold;
    bytes public lastHookData;
    bool public lastUsedHook;

    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external override {
        require(TestERC20(burnToken).transferFrom(msg.sender, address(this), amount));

        lastSender = msg.sender;
        lastAmount = amount;
        lastDestinationDomain = destinationDomain;
        lastMintRecipient = mintRecipient;
        lastBurnToken = burnToken;
        lastDestinationCaller = destinationCaller;
        lastMaxFee = maxFee;
        lastMinFinalityThreshold = minFinalityThreshold;
        delete lastHookData;
        lastUsedHook = false;
    }

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external override {
        require(TestERC20(burnToken).transferFrom(msg.sender, address(this), amount));

        lastSender = msg.sender;
        lastAmount = amount;
        lastDestinationDomain = destinationDomain;
        lastMintRecipient = mintRecipient;
        lastBurnToken = burnToken;
        lastDestinationCaller = destinationCaller;
        lastMaxFee = maxFee;
        lastMinFinalityThreshold = minFinalityThreshold;
        lastHookData = hookData;
        lastUsedHook = true;
    }
}

abstract contract RouterTestBase is Test {
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
        SWAP = new EtherSwap(address(this));
        ERC20_SWAP = new ERC20Swap(address(this));
        PERMIT2 = ISignatureTransfer(new DeployPermit2().deployPermit2());
        ROUTER = new Router(address(SWAP), address(ERC20_SWAP), address(PERMIT2));
        SIG_UTILS = new SigUtils(SWAP.DOMAIN_SEPARATOR());
        ERC20_SIG_UTILS = new SigUtils(ERC20_SWAP.DOMAIN_SEPARATOR());
        TOKEN = new TestERC20("Test", "TEST", 18, lockupAmount * 10);
        OUTPUT_TOKEN = new TestERC20("Output", "OUT", 18, lockupAmount * 10);
    }

    receive() external payable {}

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

    function lockERC20Swap(uint256 timelock) internal {
        lockERC20Swap(TOKEN, lockupAmount, timelock);
    }

    function lockERC20Swap(TestERC20 token, uint256 amount, uint256 timelock) internal {
        token.approve(address(ERC20_SWAP), amount);
        ERC20_SWAP.lock(preimageHash, amount, address(token), claimAddress, timelock);
    }

    function signErc20Claim(uint256 timelock) internal view returns (Router.Erc20Claim memory) {
        return signErc20Claim(TOKEN, lockupAmount, timelock);
    }

    function signErc20Claim(TestERC20 token, uint256 amount, uint256 timelock)
        internal
        view
        returns (Router.Erc20Claim memory)
    {
        bytes32 message = ERC20_SIG_UTILS.hashErc20SwapClaim(
            ERC20_SWAP.TYPEHASH_CLAIM(), preimage, amount, address(token), address(this), timelock, address(ROUTER)
        );
        bytes32 digest = ERC20_SIG_UTILS.getTypedDataHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimAddressKey, digest);

        return Router.Erc20Claim({
            preimage: preimage,
            amount: amount,
            tokenAddress: address(token),
            refundAddress: address(this),
            timelock: timelock,
            v: v,
            r: r,
            s: s
        });
    }

    function signClaimSend(
        uint256 privateKey,
        address token,
        address oft,
        Router.SendData memory sendData,
        uint256 minAmountLd,
        uint256 lzTokenFee,
        address sendRefundAddress
    ) internal view returns (Router.ClaimSendAuthorization memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                ROUTER.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        ROUTER.TYPEHASH_CLAIM_SEND(),
                        preimage,
                        token,
                        oft,
                        hashSendData(sendData),
                        minAmountLd,
                        lzTokenFee,
                        sendRefundAddress
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return Router.ClaimSendAuthorization({
            minAmountLd: minAmountLd, lzTokenFee: lzTokenFee, refundAddress: sendRefundAddress, v: v, r: r, s: s
        });
    }

    function executeClaimSend(
        Router.Erc20Claim memory claim,
        Router.Call[] memory calls,
        address token,
        address oft,
        Router.SendData memory sendData,
        uint256 nativeFee,
        Router.ClaimSendAuthorization memory auth
    ) internal {
        ROUTER.claimERC20ExecuteOft{value: nativeFee}(claim, calls, token, oft, sendData, auth);
    }

    function hashSendData(Router.SendData memory sendData) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                ROUTER.TYPEHASH_SEND_DATA(),
                sendData.dstEid,
                sendData.to,
                keccak256(sendData.extraOptions),
                keccak256(sendData.composeMsg),
                keccak256(sendData.oftCmd)
            )
        );
    }

    function signClaimCctp(
        uint256 privateKey,
        address token,
        address tokenMessenger,
        Router.CctpData memory cctpData,
        uint256 minAmount
    ) internal view returns (Router.ClaimCctpAuthorization memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                ROUTER.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        ROUTER.TYPEHASH_CLAIM_CCTP(), preimage, token, tokenMessenger, hashCctpData(cctpData), minAmount
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return Router.ClaimCctpAuthorization({minAmount: minAmount, v: v, r: r, s: s});
    }

    function executeClaimCctp(
        Router.Erc20Claim memory claim,
        Router.Call[] memory calls,
        address token,
        address tokenMessenger,
        Router.CctpData memory cctpData,
        Router.ClaimCctpAuthorization memory auth
    ) internal {
        ROUTER.claimERC20ExecuteCctp(claim, calls, token, tokenMessenger, cctpData, auth);
    }

    function hashCctpData(Router.CctpData memory cctpData) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                ROUTER.TYPEHASH_CCTP_DATA(),
                cctpData.destinationDomain,
                cctpData.mintRecipient,
                cctpData.destinationCaller,
                cctpData.maxFee,
                cctpData.minFinalityThreshold,
                keccak256(cctpData.hookData)
            )
        );
    }

    function defaultCctpData(bytes memory hookData) internal view returns (Router.CctpData memory) {
        return Router.CctpData({
            destinationDomain: 7,
            mintRecipient: bytes32(uint256(uint160(claimAddress))),
            destinationCaller: bytes32(uint256(uint160(address(0xBEEF)))),
            maxFee: 123,
            minFinalityThreshold: 2000,
            hookData: hookData
        });
    }
}
