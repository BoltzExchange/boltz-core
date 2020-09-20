/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import { Transaction, TxOutput } from 'bitcoinjs-lib';
import { getHexString } from '../Utils';
import { OutputType } from '../consts/Enums';
import { p2shOutput, p2shP2wshOutput, p2wshOutput } from './Scripts';

type DetectedSwap = { type: OutputType, vout: number } & TxOutput | undefined;

/**
 * Detects a swap output with the matching redeem script in a transaction
 */
export const detectSwap = (redeemScript: Buffer, transaction: Transaction): DetectedSwap => {
  const scripts = [
    p2shOutput(redeemScript),
    p2shP2wshOutput(redeemScript),
    p2wshOutput(redeemScript),
  ].map(value => getHexString(value));

  let returnValue: DetectedSwap = undefined;

  transaction.outs.forEach((output, vout) => {
    const index = scripts.indexOf(getHexString(output.script));

    const swapOutput = {
      vout,
      script: output.script,
      value: output.value,
    };

    switch (index) {
      case 0:
        returnValue = {
          type: OutputType.Legacy,
          ...swapOutput,
        };
        break;

      case 1:
        returnValue = {
          type: OutputType.Compatibility,
          ...swapOutput,
        };
        break;

      case 2:
        returnValue = {
          type: OutputType.Bech32,
          ...swapOutput,
        };
        break;
    }
  });

  return returnValue;
};
