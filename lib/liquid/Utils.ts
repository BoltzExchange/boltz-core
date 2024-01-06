import { TxOutput, confidential } from 'liquidjs-lib';
import { confidentialLiquid } from './init';

export const getOutputValue = (
  output: TxOutput & {
    blindingPrivateKey?: Buffer;
  },
): number => {
  return output.blindingPrivateKey &&
    output.rangeProof !== undefined &&
    output.rangeProof.length > 0
    ? Number(
        confidentialLiquid.unblindOutputWithKey(
          output,
          output.blindingPrivateKey,
        ).value,
      )
    : confidential.confidentialValueToSatoshi(output.value);
};
