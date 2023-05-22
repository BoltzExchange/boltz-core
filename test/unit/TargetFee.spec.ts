import { getHexBuffer } from '../../lib/Utils';
import { claimDetails } from './swap/ClaimDetails';
import { constructClaimTransaction, targetFee } from '../../lib/Boltz';

describe('TargetFee', () => {
  test.each([1, 3, 12, 42, 32, 123])(
    'should target fees @ %p sat/vbyte',
    (satPerVbyte: number) => {
      const utxo = {
        ...claimDetails[0],
        value: 10 ** 8,
      };
      const tx = targetFee(satPerVbyte, (fee) =>
        constructClaimTransaction(
          [utxo],
          getHexBuffer('00140000000000000000000000000000000000000000'),
          fee,
          false,
        ),
      );

      expect(tx.outs).toHaveLength(1);
      expect(tx.outs[0].value).toEqual(
        utxo.value - Math.ceil(tx.virtualSize() * satPerVbyte + 1),
      );
    },
  );
});
