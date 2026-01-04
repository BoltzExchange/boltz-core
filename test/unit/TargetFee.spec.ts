import { constructClaimTransaction, targetFee } from '../../lib/Boltz';
import { claimDetails } from './swap/ClaimDetails';

describe('TargetFee', () => {
  test.each([1, 3, 12, 42, 32, 123])(
    'should target fees @ %p sat/vbyte',
    (satPerVbyte: number) => {
      const utxo = {
        ...claimDetails[0],
        amount: BigInt(10) ** 8n,
      };
      const tx = targetFee(satPerVbyte, (fee) =>
        constructClaimTransaction(
          [utxo],
          Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
          fee,
          false,
        ),
      );

      expect(tx.outputsLength).toEqual(1);
      expect(tx.getOutput(0).amount).toEqual(
        utxo.amount - BigInt(Math.ceil((tx.vsize + 1) * satPerVbyte)),
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
          amount: BigInt(10) ** 8n,
        },
      ];

      for (let i = 1; i < inputs; i++) {
        utxos.push({
          ...utxos[0],
          vout: i,
        });
      }
      expect(utxos).toHaveLength(inputs);

      const constructFunc = (fee: bigint) =>
        constructClaimTransaction(
          utxos,
          Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
          fee,
          false,
        );
      const tx = targetFee(satPerVbyte, constructFunc);

      const inputSum = utxos.reduce((sum, utxo) => sum + utxo.amount, 0n);

      let outputSum = 0n;
      for (let i = 0; i < tx.outputsLength; i++) {
        outputSum += tx.getOutput(i).amount!;
      }

      expect(tx.outputsLength).toEqual(1);
      expect(tx.getOutput(0).amount).toEqual(
        inputSum -
          BigInt(Math.ceil((tx.vsize + tx.inputsLength) * satPerVbyte)),
      );

      const feePerVbyte = (inputSum - outputSum) / BigInt(tx.vsize);

      expect(feePerVbyte).toBeGreaterThanOrEqual(satPerVbyte);
      expect(feePerVbyte).toBeLessThanOrEqual(satPerVbyte + 1);
    },
  );
});
