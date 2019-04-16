/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import { Transaction, TxOutput } from 'bitcoinjs-lib';
import { p2shOutput, p2shP2wshOutput, p2wshOutput } from './Scripts';
import { getHexString } from '../Utils';
import { OutputType } from '../consts/Enums';

/**
 * Detects a swap output with the matching redeem script in a transaction
 */
export const detectSwap = (redeemScript: Buffer, transaction: Transaction) => {
  const scripts = [
    p2shOutput(redeemScript),
    p2shP2wshOutput(redeemScript),
    p2wshOutput(redeemScript),
  ].map(value => getHexString(value));

  let returnValue: { type: OutputType, vout: number } & TxOutput | undefined;

  transaction.outs.forEach((out, vout) => {
    const output = out as TxOutput;
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
