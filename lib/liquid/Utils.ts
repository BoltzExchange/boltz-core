import { confidential, TxOutput } from 'liquidjs-lib';
import { confidentialLiquid } from './Init';

export const getOutputValue = (
  output: TxOutput & {
    blindingPrivKey?: Buffer;
  },
): number => {
  return output.blindingPrivKey
    ? Number(
        confidentialLiquid.unblindOutputWithKey(output, output.blindingPrivKey)
          .value,
      )
    : confidential.confidentialValueToSatoshi(output.value);
};
