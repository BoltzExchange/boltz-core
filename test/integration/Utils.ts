import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import type { TransactionOutput } from '@scure/btc-signer/psbt.js';
import { hash160 } from '@scure/btc-signer/utils.js';
import initZkp, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import type { TxOutput as LiquidTxOutput } from 'liquidjs-lib';
import {
  Transaction as LiquidTransaction,
  address,
  address as liquidAddress,
} from 'liquidjs-lib';
import { randomBytes } from 'node:crypto';
import {
  Networks,
  OutputType,
  constructClaimTransaction,
  constructRefundTransaction,
  detectSwap,
  targetFee,
} from '../../lib/Boltz';
import type {
  ClaimDetails,
  RefundDetails,
  SwapTree,
} from '../../lib/consts/Types';
import type { LiquidClaimDetails, LiquidRefundDetails } from '../../lib/liquid';
import {
  Networks as LiquidNetworks,
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
import type swapScript from '../../lib/swap/SwapScript';
import type swapTree from '../../lib/swap/SwapTree';
import { tweakMusig } from '../../lib/swap/TaprootUtils';
import { slip77 } from '../unit/Utils';
import ElementsClient from './liquid/utils/ElementsClient';
import ChainClient from './utils/ChainClient';

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

let zkp: Secp256k1ZKP;

export const init = async () => {
  zkp = await initZkp();
};

export const generateKeys = () => {
  return secp256k1.utils.randomPrivateKey();
};

export const encodeAddress = (outputScript: Uint8Array) => {
  return Address(Networks.regtest).encode(OutScript.decode(outputScript));
};

const sendFundsToOutput = async <
  T extends
    | TransactionOutput
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

  let swapAddress = isBitcoin
    ? encodeAddress(outputScript)
    : address.fromOutputScript(outputScript, LiquidNetworks.liquidRegtest);

  let blindingPrivateKey: Buffer | undefined;

  if (confidential) {
    const enc = blindWitnessAddress(swapAddress, outputType);
    swapAddress = enc.address;
    blindingPrivateKey = enc.blindingKey.privateKey;
  }

  const chainClient = isBitcoin ? bitcoinClient : elementsClient;
  const transactionId = await chainClient.sendToAddress(swapAddress, 10000);

  const txHex = await chainClient.getRawTransaction(transactionId);
  const transaction = isBitcoin
    ? Transaction.fromRaw(hex.decode(txHex))
    : LiquidTransaction.fromHex(txHex);

  return {
    ...detectSwap(redeemScriptOrTweakedKey, transaction)!,
    blindingPrivateKey,
    type: outputType,
    transactionId,
  } as unknown as T;
};

export const destinationOutput = p2wpkhOutput(
  hash160(secp256k1.getPublicKey(generateKeys())),
);

export const blindWitnessAddress = (
  address: string,
  outputType: OutputType,
) => {
  const slip = slip77(zkp).derive(liquidAddress.toOutputScript(address));
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
  const isBitcoin = 'amount' in claimDetails[0];

  const claimTransaction = targetFee(1, (fee) => {
    if (isBitcoin) {
      return constructClaimTransaction(
        claimDetails as ClaimDetails[],
        Buffer.from(destinationOutput),
        fee,
        true,
      );
    } else {
      return liquidConstructClaimTransaction(
        claimDetails as LiquidClaimDetails[],
        Buffer.from(destinationOutput),
        fee,
        true,
        LiquidNetworks.liquidRegtest,
        outputBlindingKey,
      );
    }
  });

  await (isBitcoin ? bitcoinClient : elementsClient).sendRawTransaction(
    claimTransaction instanceof Transaction
      ? claimTransaction.hex
      : (claimTransaction as LiquidTransaction).toHex(),
  );
};

export const refundSwap = async (
  refundDetails: (RefundDetails | Omit<LiquidRefundDetails, 'keys'>)[],
  blockHeight: number,
  outputBlindingKey?: Buffer,
): Promise<void> => {
  const isBitcoin = 'amount' in refundDetails[0];

  const refundTransaction = targetFee(1, (fee) => {
    if (isBitcoin) {
      return constructRefundTransaction(
        refundDetails as RefundDetails[],
        Buffer.from(destinationOutput),
        blockHeight,
        fee,
      );
    } else {
      return liquidConstructRefundTransaction(
        refundDetails as LiquidRefundDetails[],
        Buffer.from(destinationOutput),
        blockHeight,
        fee,
        true,
        LiquidNetworks.liquidRegtest,
        outputBlindingKey,
      );
    }
  });

  await (isBitcoin ? bitcoinClient : elementsClient).sendRawTransaction(
    refundTransaction instanceof Transaction
      ? refundTransaction.hex
      : (refundTransaction as LiquidTransaction).toHex(),
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
  claimKeys: Uint8Array;
  refundKeys: Uint8Array;
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
  let tweakedMusig: Musig | undefined;

  if (outputType === OutputType.Taproot) {
    const tree = (generateScript as typeof swapTree)(
      !isBitcoin,
      sha256(preimage),
      secp256k1.getPublicKey(claimKeys),
      secp256k1.getPublicKey(refundKeys),
      timeout,
    ) as SwapTree;

    const musig = new Musig(
      isRefund ? refundKeys : claimKeys,
      [claimKeys, refundKeys].map((k) => secp256k1.getPublicKey(k)),
      randomBytes(32),
    );

    tweakedMusig = (isBitcoin ? tweakMusig : liquidTweakMusig)(
      musig,
      tree.tree,
    );

    utxo = {
      ...(await sendFundsToOutput(
        outputType,
        Buffer.from(p2trOutput(tweakedMusig.pubkeyAgg)),
        Buffer.from(tweakedMusig.pubkeyAgg),
        confidential,
      )),
      preimage,
      swapTree: tree,
      privateKey: isRefund ? refundKeys : claimKeys,
      internalKey: Buffer.from(musig.pubkeyAgg),
    };
  } else {
    const redeemScript = (generateScript as typeof swapScript)(
      sha256(preimage),
      secp256k1.getPublicKey(claimKeys),
      secp256k1.getPublicKey(refundKeys),
      timeout,
    ) as Buffer;

    utxo = {
      ...(await sendFundsToOutput(
        outputType,
        Buffer.from(outputFunctionForType(outputType)!(redeemScript)),
        redeemScript,
        confidential,
      )),
      preimage,
      redeemScript,
      privateKey: isRefund ? refundKeys : claimKeys,
    };
  }

  return {
    utxo,
    claimKeys,
    refundKeys,
    musig: tweakedMusig,
  };
};
