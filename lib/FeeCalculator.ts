import Errors from './consts/Errors';
import { OutputType } from './consts/Enums';

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
    [OutputType.Taproot]: 43 * 4,
  },
  sh: {
    [OutputType.Bech32]: 44 * 4,
    [OutputType.Legacy]: 32 * 4,
  },
};

const estimateInput = (input: Input) => {
  if (input.type === OutputType.Taproot) {
    throw Errors.TAPROOT_NOT_SUPPORTED;
  }

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
        return 41 * 4 + swapSize;

      case OutputType.Compatibility:
        return ((41 + 35) * 4) + swapSize;

      case OutputType.Legacy:
        return (swapSize + 41) * 4;
    }

    return 0;
  } else {
    return inputVbytesEstimations[input.type];
  }
};

const estimateOutput = (output: Output): number => {
  if (output.type === OutputType.Compatibility) {
    return outputVbytesEstimations.sh[OutputType.Legacy];
  }

  if (output.isSh) {
    return outputVbytesEstimations.sh[output.type];
  } else {
    return outputVbytesEstimations.pkh[output.type];
  }
};

/**
 * Estimates the vbytes of a transaction
 */
export const estimateSize = (inputs: Input[], outputs: Output[]): number => {
  // A raw transaction has always 4 bytes for the version and 4 for the locktime
  let sum = 8 * 4;
  let hasWitness = false;

  inputs.forEach((input) => {
    if (input.type !== OutputType.Legacy) {
      hasWitness = true;
    }

    sum += estimateInput(input);
  });

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
export const estimateFee = (satsPerVbyte: number, inputs: Input[], outputs: Output[]): number => {
  const size = estimateSize(inputs, outputs);

  return size * satsPerVbyte;
};
