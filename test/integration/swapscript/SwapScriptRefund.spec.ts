import { OutputType, swapScript } from '../../../lib/Boltz';
import { bitcoinClient, createSwapOutput, refundSwap } from '../Utils';

describe('SwapScript refund', () => {
  let bestBlockHeight: number;

  beforeAll(async () => {
    await bitcoinClient.init();
    const { blocks } = await bitcoinClient.getBlockchainInfo();
    bestBlockHeight = blocks;
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `(`should refund a $name swap`, async ({ type }) => {
    const { utxo } = await createSwapOutput(
      type,
      true,
      swapScript,
      bestBlockHeight,
    );
    await refundSwap([utxo], bestBlockHeight);
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `(`should not refund a $name swap before timeout`, async ({ type }) => {
    const { utxo } = await createSwapOutput(
      type,
      true,
      swapScript,
      bestBlockHeight + 1,
    );
    await expect(refundSwap([utxo], bestBlockHeight)).rejects.toEqual({
      code: -26,
      message:
        'non-mandatory-script-verify-flag (Locktime requirement not satisfied)',
    });
  });

  test('should refund multiple swaps in one transaction', async () => {
    const outputs = await Promise.all(
      [OutputType.Bech32, OutputType.Compatibility, OutputType.Legacy].map(
        (type) => {
          return createSwapOutput(type, true, swapScript, bestBlockHeight);
        },
      ),
    );

    await refundSwap(
      outputs.map((output) => output.utxo),
      bestBlockHeight,
    );
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });
});
