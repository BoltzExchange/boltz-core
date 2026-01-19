import { secp256k1 } from '@noble/curves/secp256k1.js';
import { OutputType, swapScript } from '../../../lib/Boltz';
import swapTree from '../../../lib/swap/SwapTree';
import { bitcoinClient, createSwapOutput, init, refundSwap } from '../Utils';

describe('SwapScript refund', () => {
  let bestBlockHeight: number;

  beforeAll(async () => {
    await Promise.all([init(), bitcoinClient.init()]);

    const { blocks } = await bitcoinClient.getBlockchainInfo();
    bestBlockHeight = blocks;
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `('should refund a $name swap', async ({ type }) => {
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
  `('should not refund a $name swap before timeout', async ({ type }) => {
    const { utxo } = await createSwapOutput(
      type,
      true,
      swapScript,
      bestBlockHeight + 1,
    );

    await expect(refundSwap([utxo], bestBlockHeight)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Locktime requirement not satisfied)',
      ),
    });
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `('should not refund a $name swap with invalid keys', async ({ type }) => {
    const { utxo } = await createSwapOutput(
      type,
      true,
      swapScript,
      bestBlockHeight,
    );
    utxo.privateKey = secp256k1.utils.randomPrivateKey();

    await expect(refundSwap([utxo], bestBlockHeight)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Signature must be zero for failed CHECK(MULTI)SIG operation)',
      ),
    });
  });

  test('should refund multiple swaps in one transaction', async () => {
    const outputs = await Promise.all(
      [
        OutputType.Taproot,
        OutputType.Bech32,
        OutputType.Compatibility,
        OutputType.Legacy,
      ].map((type) => {
        return createSwapOutput(
          type,
          true,
          type === OutputType.Taproot ? swapTree : swapScript,
          bestBlockHeight,
        );
      }),
    );

    await refundSwap(
      outputs.map((output) => output.utxo),
      bestBlockHeight,
    );
  });
});
