import { Transaction, script } from 'bitcoinjs-lib';

/**
 * Detects the preimage from a claim transaction
 */
export const detectPreimage = (vin: number, claimTransaction: Transaction) => {
  const input = claimTransaction.ins[vin];

  // Get the preimage for P2WSH and nested P2SH-P2WSH
  if (input.witness.length !== 0) {
    // The second element of the witness is the preimage
    return input.witness[1];
  } else {
    // Get the preimage of legacy P2SH
    const scriptBuffers = script.decompile(input.script) as (Buffer | number)[];

    // The second element of the script is the preimage
    return scriptBuffers[1] as Buffer;
  }
};
