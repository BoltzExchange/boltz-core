import { randomBytes } from 'crypto';
import { OutputType, swapScript } from '../../../lib/Boltz';
import swapTree from '../../../lib/swap/SwapTree';
import { bitcoinClient, claimSwap, createSwapOutput, init } from '../Utils';

describe('SwapScript claim', () => {
  beforeAll(async () => {
    await Promise.all([init(), bitcoinClient.init()]);
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });

  test('should not claim swaps if the preimage has an invalid hash', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Bech32,
      false,
      swapScript,
    );

    let actualError: any;

    try {
      utxo.preimage = randomBytes(32);

      await claimSwap([utxo]);
    } catch (error) {
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toContain(
      'mandatory-script-verify-flag-failed (Locktime requirement not satisfied)',
    );
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `('should claim a $name swap', async ({ type }) => {
    const { utxo } = await createSwapOutput(type, false, swapScript);
    await claimSwap([utxo]);
  });

  test('should claim multiple swaps in one transaction', async () => {
    const outputs = await Promise.all(
      [
        OutputType.Taproot,
        OutputType.Bech32,
        OutputType.Compatibility,
        OutputType.Legacy,
      ].map((type) => {
        return createSwapOutput(
          type,
          false,
          type === OutputType.Taproot ? swapTree : swapScript,
        );
      }),
    );
    await claimSwap(outputs.map((output) => output.utxo));
  });
});
