import { randomBytes } from 'crypto';
import { OutputType, reverseSwapScript } from '../../../lib/Boltz';
import { bitcoinClient, claimSwap, createSwapOutput } from '../Utils';

describe('ReverseSwapScript claim', () => {
  beforeAll(async () => {
    await bitcoinClient.init();
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });

  test('should not claim reverse swaps if the preimage has an invalid length', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Bech32,
      false,
      reverseSwapScript,
    );
    utxo.preimage = randomBytes(31);

    let actualError: any;

    try {
      await claimSwap([utxo]);
    } catch (error) {
      // If the preimage has in invalid length the refund key is loaded and the signature is verified against it
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toEqual(
      'mandatory-script-verify-flag-failed (Locktime requirement not satisfied)',
    );
  });

  test('should not claim reverse swaps if the preimage has a valid length but an invalid hash', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Bech32,
      false,
      reverseSwapScript,
    );
    utxo.preimage = randomBytes(32);

    let actualError: any;

    try {
      await claimSwap([utxo]);
    } catch (error) {
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toEqual(
      'mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)',
    );
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `(`should claim a $name reverse swap`, async ({ type }) => {
    const { utxo } = await createSwapOutput(type, false, reverseSwapScript);
    await claimSwap([utxo]);
  });

  test('should claim multiple reverse swaps in one transaction', async () => {
    const outputs = await Promise.all(
      [OutputType.Bech32, OutputType.Compatibility, OutputType.Legacy].map(
        (type) => {
          return createSwapOutput(type, false, reverseSwapScript);
        },
      ),
    );
    await claimSwap(outputs.map((output) => output.utxo));
  });
});
