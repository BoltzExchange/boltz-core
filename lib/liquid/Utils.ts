import { confidential, TxOutput } from 'liquidjs-lib';
import { confidentialLiquid } from './Init';

export const getOutputValue = (
  output: TxOutput & {
    blindingPrivateKey?: Buffer;
  },
): number => {
  return output.blindingPrivateKey
    ? Number(
        confidentialLiquid.unblindOutputWithKey(
          output,
          output.blindingPrivateKey,
        ).value,
      )
    : confidential.confidentialValueToSatoshi(output.value);
};
