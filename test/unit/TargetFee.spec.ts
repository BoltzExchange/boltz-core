import { constructClaimTransaction, targetFee } from '../../lib/Boltz';
import { getHexBuffer } from '../../lib/Utils';
import { claimDetails } from './swap/ClaimDetails';

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
        utxo.value - Math.ceil((tx.virtualSize() + 1) * satPerVbyte),
      );
    },
  );

  test.each([
    [2, 1],
    [3, 1],
    [2, 3],
    [2, 12],
    [2, 42],
    [3, 32],
    [2, 123],
  ])(
    'should target fees with %p inputs @ %p sat/vbyte',
    (inputs: number, satPerVbyte: number) => {
      const utxos = [
        {
          ...claimDetails[0],
          value: 10 ** 8,
        },
      ];

      for (let i = 1; i < inputs; i++) {
        utxos.push({
          ...utxos[0],
          vout: i,
        });
      }
      expect(utxos).toHaveLength(inputs);

      const constructFunc = (fee) =>
        constructClaimTransaction(
          utxos,
          getHexBuffer('00140000000000000000000000000000000000000000'),
          fee,
          false,
        );
      const tx = targetFee(satPerVbyte, constructFunc);

      const inputSum = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      const outputSum = tx.outs.reduce((sum, output) => sum + output.value, 0);

      expect(tx.outs).toHaveLength(1);
      expect(tx.outs[0].value).toEqual(
        inputSum -
          Math.ceil(
            (constructFunc(1).virtualSize() + tx.ins.length) * satPerVbyte,
          ),
      );

      const feePerVbyte = (inputSum - outputSum) / tx.virtualSize();

      expect(feePerVbyte).toBeGreaterThanOrEqual(satPerVbyte);
      expect(feePerVbyte).toBeLessThan(satPerVbyte + 1);
    },
  );
});
