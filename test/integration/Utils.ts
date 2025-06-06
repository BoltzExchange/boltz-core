import zkp, { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import {
  Transaction,
  TxOutput,
  address,
  crypto,
  initEccLib,
} from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import { ECPairInterface } from 'ecpair';
import {
  Transaction as LiquidTransaction,
  TxOutput as LiquidTxOutput,
  address as liquidAddress,
} from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import {
  Networks,
  OutputType,
  constructClaimTransaction,
  constructRefundTransaction,
  detectSwap,
  targetFee,
} from '../../lib/Boltz';
import { ClaimDetails, RefundDetails, SwapTree } from '../../lib/consts/Types';
import {
  LiquidClaimDetails,
  Networks as LiquidNetworks,
  LiquidRefundDetails,
  constructClaimTransaction as liquidConstructClaimTransaction,
  constructRefundTransaction as liquidConstructRefundTransaction,
} from '../../lib/liquid';
import { tweakMusig as liquidTweakMusig } from '../../lib/liquid/swap/TaprootUtils';
import Musig from '../../lib/musig/Musig';
import {
  outputFunctionForType,
  p2trOutput,
  p2wpkhOutput,
} from '../../lib/swap/Scripts';
import swapScript from '../../lib/swap/SwapScript';
import swapTree from '../../lib/swap/SwapTree';
import { tweakMusig } from '../../lib/swap/TaprootUtils';
import { ECPair, slip77 } from '../unit/Utils';
import ElementsClient from './liquid/utils/ElementsClient';
import ChainClient from './utils/ChainClient';

let secp: Secp256k1ZKP;

export const generateKeys = (): ECPairInterface => {
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
    const enc = blindWitnessAddress(swapAddress, outputType);
    swapAddress = enc.address;
    blindingPrivateKey = enc.blindingKey.privateKey;
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
  crypto.hash160(Buffer.from(generateKeys().publicKey)),
);

export const blindWitnessAddress = (
  address: string,
  outputType: OutputType,
) => {
  const slip = slip77.derive(liquidAddress.toOutputScript(address));
  const dec = liquidAddress.fromBech32(address);

  return {
    blindingKey: slip,
    address: liquidAddress.toBlech32(
      Buffer.concat([Buffer.from([dec.version, dec.data.length]), dec.data]),
      slip.publicKey!,
      LiquidNetworks.liquidRegtest.blech32,
      outputType === OutputType.Bech32 ? 0 : 1,
    ),
  };
};

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
  refundDetails: (RefundDetails | Omit<LiquidRefundDetails, 'keys'>)[],
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

  const { blocks } = await (
    isBitcoin ? bitcoinClient : elementsClient
  ).getBlockchainInfo();

  const timeout = timeoutBlockHeight || blocks + 1;

  let utxo: T;
  let musig: Musig | undefined;

  if (outputType === OutputType.Taproot) {
    const tree = (generateScript as typeof swapTree)(
      !isBitcoin,
      crypto.sha256(preimage),
      Buffer.from(claimKeys.publicKey),
      Buffer.from(refundKeys.publicKey),
      timeout,
    ) as SwapTree;

    musig = new Musig(
      secp,
      isRefund ? refundKeys : claimKeys,
      randomBytes(32),
      [claimKeys.publicKey, refundKeys.publicKey].map(Buffer.from),
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
      Buffer.from(claimKeys.publicKey),
      Buffer.from(refundKeys.publicKey),
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
