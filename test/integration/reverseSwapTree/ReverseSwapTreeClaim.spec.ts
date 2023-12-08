import { randomBytes } from 'crypto';
import { OutputType } from '../../../lib/consts/Enums';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import { bitcoinClient, claimSwap, createSwapOutput, init } from '../Utils';

describe('ReverseSwapTree claim', () => {
  beforeAll(async () => {
    await Promise.all([init(), bitcoinClient.init()]);
  });

  afterEach(async () => {
    await bitcoinClient.generate(1);
  });

  test.each`
    length
    ${31}
    ${33}
    ${64}
  `(
    `should not claim via script path when preimage length is invalid (length $length)`,
    async ({ length }) => {
      const { utxo } = await createSwapOutput(
        OutputType.Taproot,
        false,
        reverseSwapTree,
        undefined,
        undefined,
        randomBytes(length),
      );

      await expect(claimSwap([utxo])).rejects.toEqual({
        code: -26,
        message:
          'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
      });
    },
  );
});
