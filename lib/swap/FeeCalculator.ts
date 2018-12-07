import { OutputType } from '../consts/Enums';

export type Input = {
  type: OutputType,

  // In case the input is a Swap this fields have to be set
  swapDetails?: {
    redeemScript: Buffer;
    preimage?: Buffer;
  };
};

export type Output = {
  type: OutputType;

  isSh?: boolean;
};

// Estimations for the vbytes of different PKH inputs
const inputVbytesEstimations = {
  [OutputType.Bech32]: 108 + (41 * 4),
  [OutputType.Compatibility]: 108 + (64 * 4),
  [OutputType.Legacy]: 148 * 4,
};

// Estimations for the vbytes of different PKH and SH outputs
const outputVbytesEstimations = {
  pkh: {
    [OutputType.Bech32]: 31 * 4,
    [OutputType.Legacy]: 34 * 4,
  },
  sh: {
    [OutputType.Bech32]: 34 * 4,
    [OutputType.Legacy]: 32 * 4,
  },
};

/**
 * Estimates the vbytes of a transaction
 */
const estimateSize = (inputs: Input[], outputs: Output[]) => {
  // A raw transaction has always 4 bytes for the version and 4 for the locktime
  let sum = 8 * 4;
  let hasWitness = false;

  const estimateInput = (input: Input) => {
    if (input.swapDetails) {
      const swapSize = [
        // PUSHDATA opcode
        1,
        // ECDSA signature
        72,
        // PUSHDATA opcode if there is a preimage
        input.swapDetails.preimage ? 1 : 0,
        // preimage if there is one
        input.swapDetails.preimage ? input.swapDetails.preimage.length : 0,
        // Sequence
        4,
        // Redeemscript
        input.swapDetails.redeemScript.length,
      ].reduce((swapSize, n) => swapSize + n);

      switch (input.type) {
        case OutputType.Bech32:
          return swapSize;

        case OutputType.Compatibility:
          // Three times the original serialization (in this case OP_0 and
          // the SHA256 hash of the redeemScript) plus the witness size (swapSize)
          //
          // Reference: https://bitcoincore.org/en/segwit_wallet_dev/#transaction-fee-estimation
          return 35 * 3 + swapSize;

        case OutputType.Legacy:
          return swapSize * 4;
      }

      return 0;
    } else {
      return inputVbytesEstimations[input.type];
    }
  };

  inputs.forEach((input) => {
    if (input.type !== OutputType.Legacy) {
      hasWitness = true;
    }

    sum += estimateInput(input);
  });

  const estimateOutput = (output: Output): number => {
    if (output.isSh) {
      switch (output.type) {
        case OutputType.Bech32:
          return outputVbytesEstimations.sh[OutputType.Bech32];

        case OutputType.Compatibility:
          return outputVbytesEstimations.sh[OutputType.Legacy];

        case OutputType.Legacy:
          return outputVbytesEstimations.sh[OutputType.Legacy];
      }
    } else {
      switch (output.type) {
        case OutputType.Bech32:
          return outputVbytesEstimations.pkh[OutputType.Bech32];

        case OutputType.Compatibility:
          return outputVbytesEstimations.sh[OutputType.Legacy];

        case OutputType.Legacy:
          return outputVbytesEstimations.pkh[OutputType.Legacy];
      }
    }

    // Although all options are covered by the switch statements
    // TypeScript shows and error if this line isn't there
    return outputVbytesEstimations.pkh[OutputType.Legacy];
  };

  outputs.forEach((output) => {
    sum += estimateOutput(output);
  });

  if (hasWitness) {
    sum += 8;
  }

  // Divide the weight by 4 and round it up to the next integer
  return Math.ceil(sum / 4);
};

/**
 * Estimates the amount of satoshis that should be paid as fee
 */
export const estimateFee = (satsPerVbyte: number, inputs: Input[], outputs: Output[]) => {
  const size = estimateSize(inputs, outputs);

  return size * satsPerVbyte;
};
