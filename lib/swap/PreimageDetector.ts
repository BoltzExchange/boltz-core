import { script } from 'bitcoinjs-lib';

/**
 * Detects the preimage from a claim transaction
 */
export const detectPreimage = (
  vin: number,
  claimTransaction: { ins: { script: Buffer; witness: Buffer[] }[] },
): Buffer => {
  const input = claimTransaction.ins[vin];

  // Get the preimage for P2TR, P2WSH and nested P2SH-P2WSH
  if (input.witness.length !== 0) {
    // The second element of the witness is the preimage for claims with signature
    // The first element in case of claims with covenant
    return input.witness[0].length === 32 ? input.witness[0] : input.witness[1];
  } else {
    // Get the preimage of legacy P2SH
    const scriptBuffers = script.decompile(input.script) as (Buffer | number)[];

    // The second element of the script is the preimage
    return scriptBuffers[1] as Buffer;
  }
};
