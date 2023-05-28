import { OutputType, reverseSwapScript } from '../../../lib/Boltz';
import { bitcoinClient, createSwapOutput, refundSwap } from '../Utils';

describe('ReverseSwapScript refund', () => {
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
  `(`should refund a $name reverse swap`, async ({ type }) => {
    const { utxo } = await createSwapOutput(
      type,
      true,
      reverseSwapScript,
      bestBlockHeight,
    );
    await refundSwap([utxo], bestBlockHeight);
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `(
    `should not refund a $name reverse swap before timeout`,
    async ({ type }) => {
      const { utxo } = await createSwapOutput(
        type,
        true,
        reverseSwapScript,
        bestBlockHeight + 1,
      );
      await expect(refundSwap([utxo], bestBlockHeight)).rejects.toEqual({
        code: -26,
        message:
          'non-mandatory-script-verify-flag (Locktime requirement not satisfied)',
      });
    },
  );

  test('should refund multiple reverse swaps in one transaction', async () => {
    const outputs = await Promise.all(
      [OutputType.Bech32, OutputType.Compatibility, OutputType.Legacy].map(
        (type) => {
          return createSwapOutput(
            type,
            true,
            reverseSwapScript,
            bestBlockHeight,
          );
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
