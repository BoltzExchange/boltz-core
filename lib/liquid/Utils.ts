import ops from '@boltz/bitcoin-ops';
import { confidential, crypto, script } from 'liquidjs-lib';
import type { TxOutput } from 'liquidjs-lib';
import { confidentialLiquid } from './init';

export const getOutputValue = (
  output: TxOutput & {
    blindingPrivateKey?: Uint8Array;
  },
): number => {
  return output.blindingPrivateKey &&
    output.rangeProof !== undefined &&
    output.rangeProof.length > 0
    ? Number(
        confidentialLiquid.unblindOutputWithKey(
          output,
          Buffer.from(output.blindingPrivateKey),
        ).value,
      )
    : confidential.confidentialValueToSatoshi(output.value);
};

const getScriptIntrospectionWitnessScript = (outputScript: Buffer) =>
  outputScript.subarray(2, 40);

export const getScriptIntrospectionValues = (
  outputScript: Buffer,
): { version: number; script: Buffer } => {
  const dec = script.decompile(outputScript)!;

  switch (dec[0]) {
    case ops.OP_1:
      return {
        version: 1,
        script: getScriptIntrospectionWitnessScript(outputScript),
      };

    case ops.OP_0:
      return {
        version: 0,
        script: getScriptIntrospectionWitnessScript(outputScript),
      };

    default:
      return {
        version: -1,
        script: crypto.sha256(outputScript),
      };
  }
};
