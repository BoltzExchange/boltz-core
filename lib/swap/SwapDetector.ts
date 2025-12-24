import { Transaction } from '@scure/btc-signer';
import type { TransactionOutput } from '@scure/btc-signer/psbt.js';
import { equalBytes } from '@scure/btc-signer/utils.js';
import { OutputType } from '../consts/Enums';
import {
  p2shOutput,
  p2shP2wshOutput,
  p2trOutput,
  p2wshOutput,
} from './Scripts';

type LiquidTxOutput = {
  script: Buffer;
  value: Buffer;
  asset: Buffer;
  nonce: Buffer;
  rangeProof?: Buffer;
  surjectionProof?: Buffer;
};

type LiquidTransaction = { outs: LiquidTxOutput[] };

type DetectedSwap<T> = {
  type: OutputType;
  vout: number;
} & (T extends Transaction ? TransactionOutput : LiquidTxOutput);

/**
 * Detects a swap output with the matching redeem script or tweaked key in a transaction
 */
export const detectSwap = <T extends Transaction | LiquidTransaction>(
  redeemScriptOrTweakedKey: Uint8Array,
  transaction: T,
): DetectedSwap<T> | undefined => {
  const scripts: [OutputType, Uint8Array][] = [
    [OutputType.Legacy, p2shOutput(redeemScriptOrTweakedKey)],
    [OutputType.Compatibility, p2shP2wshOutput(redeemScriptOrTweakedKey)],
    [OutputType.Bech32, p2wshOutput(redeemScriptOrTweakedKey)],
    [OutputType.Taproot, p2trOutput(redeemScriptOrTweakedKey)],
  ];

  const findMatch = (
    vout: number,
    output: TransactionOutput | LiquidTxOutput,
  ): DetectedSwap<T> | undefined => {
    const scriptMatch = scripts.find(([, script]) =>
      equalBytes(script, output.script!),
    );

    if (scriptMatch) {
      return {
        ...output,
        vout,
        type: scriptMatch[0],
      } as DetectedSwap<T>;
    }

    return undefined;
  };

  if (transaction instanceof Transaction) {
    for (let vout = 0; vout < transaction.outputsLength; vout++) {
      const match = findMatch(vout, transaction.getOutput(vout)!);
      if (match) {
        return match;
      }
    }
  } else {
    for (const [vout, output] of transaction.outs.entries()) {
      const match = findMatch(vout, output);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
};
