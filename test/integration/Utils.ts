import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import { ECPairInterface } from 'ecpair';
import zkp, { Secp256k1ZKP } from '@michael1011/secp256k1-zkp';
import {
  address,
  crypto,
  initEccLib,
  Transaction,
  TxOutput,
} from 'bitcoinjs-lib';
import {
  address as liquidAddress,
  Transaction as LiquidTransaction,
  TxOutput as LiquidTxOutput,
} from 'liquidjs-lib';
import ChainClient from './utils/ChainClient';
import Musig from '../../lib/musig/Musig';
import { ECPair, slip77 } from '../unit/Utils';
import swapTree from '../../lib/swap/SwapTree';
import swapScript from '../../lib/swap/SwapScript';
import ElementsClient from './liquid/utils/ElementsClient';
import { tweakMusig } from '../../lib/swap/TaprootUtils';
import { tweakMusig as liquidTweakMusig } from '../../lib/liquid/swap/TaprooUtils';
import { ClaimDetails, RefundDetails, SwapTree } from '../../lib/consts/Types';
import {
  constructClaimTransaction as liquidConstructClaimTransaction,
  constructRefundTransaction as liquidConstructRefundTransaction,
  LiquidClaimDetails,
  LiquidRefundDetails,
  Networks as LiquidNetworks,
} from '../../lib/liquid';
import {
  outputFunctionForType,
  p2trOutput,
  p2wpkhOutput,
} from '../../lib/swap/Scripts';
import {
  constructClaimTransaction,
  constructRefundTransaction,
  detectSwap,
  Networks,
  OutputType,
  targetFee,
} from '../../lib/Boltz';

let secp: Secp256k1ZKP;

const generateKeys = (): ECPairInterface => {
  return ECPair.makeRandom({ network: Networks.bitcoinRegtest });
};

const sendFundsToOutput = async <
  T extends
    | TxOutput
    | (LiquidTxOutput & {
        blindingPrivateKey?: Buffer;
      }),
>(
  outputType: OutputType,
  outputScript: Buffer,
  redeemScriptOrTweakedKey: Buffer,
  confidential?: boolean,
): Promise<T> => {
  const isBitcoin = confidential === undefined;
  const network = isBitcoin
    ? Networks.bitcoinRegtest
    : LiquidNetworks.liquidRegtest;

  let swapAddress = address.fromOutputScript(outputScript, network);

  let blindingPrivateKey: Buffer | undefined;

  if (confidential) {
    const slip = slip77.derive(outputScript);
    blindingPrivateKey = slip.privateKey;

    const dec = liquidAddress.fromBech32(swapAddress);
    swapAddress = liquidAddress.toBlech32(
      Buffer.concat([Buffer.from([dec.version, dec.data.length]), dec.data]),
      slip.publicKey!,
      LiquidNetworks.liquidRegtest.blech32,
      outputType === OutputType.Bech32 ? 0 : 1,
    );
  }

  const chainClient = isBitcoin ? bitcoinClient : elementsClient;
  const transactionId = await chainClient.sendToAddress(swapAddress, 10000);
  const transaction = (isBitcoin ? Transaction : LiquidTransaction).fromHex(
    await chainClient.getRawTransaction(transactionId),
  );

  return {
    ...detectSwap(redeemScriptOrTweakedKey, transaction)!,
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

export const init = async () => {
  initEccLib(ecc);
  secp = await zkp();
};

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
        LiquidNetworks.liquidRegtest,
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
        LiquidNetworks.liquidRegtest,
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
  generateScript: typeof swapScript | typeof swapTree,
  timeoutBlockHeight?: number,
  confidential?: boolean,
  preimage?: Buffer,
): Promise<{
  utxo: T;
  musig?: Musig;
  claimKeys: ECPairInterface;
  refundKeys: ECPairInterface;
}> => {
  const claimKeys = generateKeys();
  const refundKeys = generateKeys();

  preimage = preimage || randomBytes(32);

  const isBitcoin = confidential === undefined;

  const { blocks } = await (isBitcoin
    ? bitcoinClient
    : elementsClient
  ).getBlockchainInfo();

  const timeout = timeoutBlockHeight || blocks + 1;

  let utxo: T;
  let musig: Musig | undefined;

  if (outputType === OutputType.Taproot) {
    const tree = (generateScript as typeof swapTree)(
      !isBitcoin,
      crypto.sha256(preimage),
      claimKeys.publicKey,
      refundKeys.publicKey,
      timeout,
    ) as SwapTree;

    musig = new Musig(
      secp,
      isRefund ? refundKeys : claimKeys,
      randomBytes(32),
      [claimKeys.publicKey, refundKeys.publicKey],
    );

    const tweakedKey = (isBitcoin ? tweakMusig : liquidTweakMusig)(
      musig,
      tree.tree,
    );

    utxo = {
      ...(await sendFundsToOutput(
        outputType,
        p2trOutput(tweakedKey),
        tweakedKey,
        confidential,
      )),
      preimage,
      swapTree: tree,
      keys: isRefund ? refundKeys : claimKeys,
      internalKey: musig.getAggregatedPublicKey(),
    };
  } else {
    const redeemScript = (generateScript as typeof swapScript)(
      crypto.sha256(preimage),
      claimKeys.publicKey,
      refundKeys.publicKey,
      timeout,
    ) as Buffer;

    utxo = {
      ...(await sendFundsToOutput(
        outputType,
        outputFunctionForType(outputType)!(redeemScript),
        redeemScript,
        confidential,
      )),
      preimage,
      redeemScript,
      keys: isRefund ? refundKeys : claimKeys,
    };
  }

  return {
    utxo,
    musig,
    claimKeys,
    refundKeys,
  };
};
