import { randomBytes } from 'crypto';
import { ECPairInterface } from 'ecpair';
import { Network as LiquidNetwork } from 'liquidjs-lib/src/networks';
import { address, crypto, Transaction, TxOutput } from 'bitcoinjs-lib';
import {
  payments as liquidPayments,
  Transaction as LiquidTransaction,
  TxOutput as LiquidTxOutput,
} from 'liquidjs-lib';
import ChainClient from './utils/ChainClient';
import { ECPair, slip77 } from '../unit/Utils';
import SwapScript from '../../lib/swap/SwapScript';
import ElementsClient from './liquid/utils/ElementsClient';
import { ClaimDetails, RefundDetails } from '../../lib/consts/Types';
import { outputFunctionForType, p2wpkhOutput } from '../../lib/swap/Scripts';
import {
  LiquidClaimDetails,
  LiquidRefundDetails,
} from '../../lib/liquid/consts/Types';
import {
  constructClaimTransaction as liquidConstructClaimTransaction,
  constructRefundTransaction as liquidConstructRefundTransaction,
  Networks as LiquidNetworks,
} from '../../lib/liquid';
import {
  constructClaimTransaction,
  constructRefundTransaction,
  detectSwap,
  Networks,
  OutputType,
  targetFee,
} from '../../lib/Boltz';

const generateKeys = (): ECPairInterface => {
  return ECPair.makeRandom({ network: Networks.bitcoinRegtest });
};

const sendFundsToRedeemScript = async <
  T extends
    | TxOutput
    | (LiquidTxOutput & {
        blindingPrivateKey?: Buffer;
      }),
>(
  outputType: OutputType,
  redeemScript: Buffer,
  confidential?: boolean,
): Promise<T> => {
  const isBitcoin = confidential === undefined;
  const network = isBitcoin
    ? Networks.bitcoinRegtest
    : LiquidNetworks.liquidRegtest;

  const outputScript = outputFunctionForType(outputType)!(redeemScript);
  let swapAddress = address.fromOutputScript(outputScript, network);

  let blindingPrivateKey: Buffer | undefined;

  if (confidential) {
    const slip = slip77.derive(outputScript);
    blindingPrivateKey = slip.privateKey;
    swapAddress = liquidPayments.p2wsh({
      network: network as LiquidNetwork,
      output: outputScript,
      blindkey: slip.publicKey,
    }).confidentialAddress!;
  }

  const chainClient = isBitcoin ? bitcoinClient : elementsClient;
  const transactionId = await chainClient.sendToAddress(swapAddress, 10000);
  const transaction = (isBitcoin ? Transaction : LiquidTransaction).fromHex(
    await chainClient.getRawTransaction(transactionId),
  );

  return {
    ...detectSwap(redeemScript, transaction)!,
    blindingPrivateKey,
    type: outputType,
    txHash: transaction.getHash(),
  } as unknown as T;
};

export const bitcoinClient = new ChainClient({
  host: '127.0.0.1',
  port: 18443,
  rpcuser: 'kek',
  rpcpass: 'kek',
});

export const elementsClient = new ElementsClient({
  host: '127.0.0.1',
  port: 18884,
  rpcuser: 'elements',
  rpcpass: 'elements',
});

export const destinationOutput = p2wpkhOutput(
  crypto.hash160(generateKeys().publicKey!),
);

export const claimSwap = async (
  claimDetails: (ClaimDetails | LiquidClaimDetails)[],
  outputBlindingKey?: Buffer,
): Promise<void> => {
  const isBitcoin = typeof claimDetails[0].value === 'number';

  const claimTransaction = targetFee(1, (fee) => {
    if (isBitcoin) {
      return constructClaimTransaction(
        claimDetails as ClaimDetails[],
        destinationOutput,
        fee,
        true,
      );
    } else {
      return liquidConstructClaimTransaction(
        claimDetails as LiquidClaimDetails[],
        destinationOutput,
        fee,
        true,
        LiquidNetworks.liquidRegtest.assetHash,
        outputBlindingKey,
      );
    }
  });

  await (isBitcoin ? bitcoinClient : elementsClient).sendRawTransaction(
    claimTransaction.toHex(),
  );
};

export const refundSwap = async (
  refundDetails: (RefundDetails | LiquidRefundDetails)[],
  blockHeight: number,
  outputBlindingKey?: Buffer,
): Promise<void> => {
  const isBitcoin = typeof refundDetails[0].value === 'number';

  const refundTransaction = targetFee(1, (fee) => {
    if (isBitcoin) {
      return constructRefundTransaction(
        refundDetails as RefundDetails[],
        destinationOutput,
        blockHeight,
        fee,
      );
    } else {
      return liquidConstructRefundTransaction(
        refundDetails as LiquidRefundDetails[],
        destinationOutput,
        blockHeight,
        fee,
        true,
        LiquidNetworks.liquidRegtest.assetHash,
        outputBlindingKey,
      );
    }
  });

  await (isBitcoin ? bitcoinClient : elementsClient).sendRawTransaction(
    refundTransaction.toHex(),
  );
};

export const createSwapOutput = async <
  T extends ClaimDetails | LiquidClaimDetails = ClaimDetails,
>(
  outputType: OutputType,
  isRefund: boolean,
  generateScript: typeof SwapScript,
  timeoutBlockHeight?: number,
  confidential?: boolean,
): Promise<{
  utxo: T;
  claimKeys: ECPairInterface;
  refundKeys: ECPairInterface;
}> => {
  const claimKeys = generateKeys();
  const refundKeys = generateKeys();

  const preimage = randomBytes(32);

  const { blocks } = await (confidential === undefined
    ? bitcoinClient
    : elementsClient
  ).getBlockchainInfo();

  const redeemScript = generateScript(
    crypto.sha256(preimage),
    claimKeys.publicKey,
    refundKeys.publicKey,
    timeoutBlockHeight || blocks + 1,
  );

  const utxo: T = {
    ...(await sendFundsToRedeemScript(outputType, redeemScript, confidential)),
    preimage,
    redeemScript,
    keys: isRefund ? refundKeys : claimKeys,
  };

  return {
    utxo,
    claimKeys,
    refundKeys,
  };
};
