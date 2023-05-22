import { randomBytes } from 'crypto';
import { ECPairInterface } from 'ecpair';
import { address, crypto, Transaction } from 'bitcoinjs-lib';
import { ECPair } from '../unit/swap/Utils';
import ChainClient from './utils/ChainClient';
import SwapScript from '../../lib/swap/SwapScript';
import { outputFunctionForType, p2wpkhOutput } from '../../lib/swap/Scripts';
import {
  ClaimDetails,
  RefundDetails,
  TransactionOutput,
} from '../../lib/consts/Types';
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

const sendFundsToRedeemScript = async (
  outputType: OutputType,
  redeemScript: Buffer,
): Promise<TransactionOutput> => {
  const swapAddress = address.fromOutputScript(
    outputFunctionForType(outputType)!(redeemScript),
    Networks.bitcoinRegtest,
  );
  const transactionId = await bitcoinClient.sendToAddress(swapAddress, 10000);
  const transaction = Transaction.fromHex(
    (await bitcoinClient.getRawTransaction(transactionId)) as string,
  );

  const { vout, value, script } = detectSwap(redeemScript, transaction)!;

  return {
    vout,
    value,
    script,
    type: outputType,
    txHash: transaction.getHash(),
  };
};

export const bitcoinClient = new ChainClient({
  host: '127.0.0.1',
  port: 18443,
  rpcuser: 'kek',
  rpcpass: 'kek',
});

export const destinationOutput = p2wpkhOutput(
  crypto.hash160(generateKeys().publicKey!),
);

export const claimSwap = async (claimDetails: ClaimDetails): Promise<void> => {
  const claimTransaction = targetFee(1, (fee) =>
    constructClaimTransaction([claimDetails], destinationOutput, fee, true),
  );

  await bitcoinClient.sendRawTransaction(claimTransaction.toHex());
};

export const refundSwap = async (
  refundDetails: RefundDetails,
  blockHeight: number,
): Promise<void> => {
  const refundTransaction = targetFee(1, (fee) =>
    constructRefundTransaction(
      [refundDetails],
      destinationOutput,
      blockHeight,
      fee,
    ),
  );

  await bitcoinClient.sendRawTransaction(refundTransaction.toHex());
};

export const createSwapOutput = async (
  outputType: OutputType,
  isRefund: boolean,
  generateScript: typeof SwapScript,
  timeoutBlockHeight?: number,
): Promise<{
  utxo: ClaimDetails;
  claimKeys: ECPairInterface;
  refundKeys: ECPairInterface;
}> => {
  const claimKeys = generateKeys();
  const refundKeys = generateKeys();

  const preimage = randomBytes(32);

  const { blocks } = await bitcoinClient.getBlockchainInfo();

  const redeemScript = generateScript(
    crypto.sha256(preimage),
    claimKeys.publicKey,
    refundKeys.publicKey,
    timeoutBlockHeight || blocks + 1,
  );

  const utxo: ClaimDetails = {
    ...(await sendFundsToRedeemScript(outputType, redeemScript)),
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
