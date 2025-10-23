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
    'should not claim via script path when preimage length is invalid (length $length)',
    async ({ length }) => {
      const { utxo } = await createSwapOutput(
        OutputType.Taproot,
        false,
        reverseSwapTree,
        undefined,
        undefined,
        randomBytes(length),
      );

      try {
        await claimSwap([utxo]);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(-26);
        expect(error.message).toContain(
          'mempool-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)',
        );
      }
    },
  );
});
