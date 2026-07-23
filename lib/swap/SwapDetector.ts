import { Transaction } from '@scure/btc-signer';
import type { TransactionOutput } from '@scure/btc-signer/psbt.js';
import { equalBytes } from '@scure/btc-signer/utils.js';
import { OutputType } from '../consts/Enums.ts';
import {
  p2shOutput,
  p2shP2wshOutput,
  p2trOutput,
  p2wshOutput,
} from './Scripts.ts';

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

const scriptForType: Record<OutputType, (input: Uint8Array) => Uint8Array> = {
  [OutputType.Legacy]: p2shOutput,
  [OutputType.Compatibility]: p2shP2wshOutput,
  [OutputType.Bech32]: p2wshOutput,
  [OutputType.Taproot]: p2trOutput,
};

/**
 * Detects a swap output with the matching redeem script or tweaked key in a transaction
 *
 * @param redeemScriptOrTweakedKey redeem script or tweaked key of the swap
 * @param transaction transaction to scan for the swap output
 * @param expectedOutput the advertised output wrapper to detect; either an
 *   {@link OutputType} or the exact expected output script. Detection is bound to
 *   this wrapper so a lockup can never be matched against a different one.
 */
export const detectSwap = <T extends Transaction | LiquidTransaction>(
  redeemScriptOrTweakedKey: Uint8Array,
  transaction: T,
  expectedOutput: OutputType | Uint8Array,
): DetectedSwap<T> | undefined => {
  const scripts = (
    [
      OutputType.Legacy,
      OutputType.Compatibility,
      OutputType.Bech32,
      OutputType.Taproot,
    ] as OutputType[]
  )
    .map((type): [OutputType, Uint8Array] => [
      type,
      scriptForType[type](redeemScriptOrTweakedKey),
    ])
    .filter(([type, script]) =>
      typeof expectedOutput === 'number'
        ? type === expectedOutput
        : equalBytes(script, expectedOutput),
    );

  const findMatch = (
    vout: number,
    output: TransactionOutput | LiquidTxOutput,
  ): DetectedSwap<T> | undefined => {
    const scriptMatch = scripts.find(
      ([, script]) =>
        output.script !== undefined && equalBytes(script, output.script),
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
      const match = findMatch(vout, transaction.getOutput(vout));
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
