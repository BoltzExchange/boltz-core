import { secp256k1 } from '@noble/curves/secp256k1';
import { OutputType } from '../../../lib/consts/Enums';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../lib/swap/SwapTree';
import { bitcoinClient, createSwapOutput, init, refundSwap } from '../Utils';

describe.each`
  name                 | treeFunc
  ${'SwapTree'}        | ${swapTree}
  ${'ReverseSwapTree'} | ${reverseSwapTree}
`('$name refund', ({ treeFunc }) => {
  beforeAll(async () => {
    await Promise.all([init(), bitcoinClient.init()]);
  });

  afterEach(async () => {
    await bitcoinClient.generate(1);
  });

  test('should refund via script path', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      true,
      treeFunc,
      timeout,
    );
    await refundSwap([utxo], timeout);
  });

  test('should not refund via script path when timelock is not reached', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      true,
      treeFunc,
      timeout + 21,
    );

    try {
      await refundSwap([utxo], timeout);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe(-26);
      expect(error.message).toContain(
        'mempool-script-verify-flag-failed (Locktime requirement not satisfied)',
      );
    }
  });

  test('should not refund via script path when refund key is invalid', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      true,
      treeFunc,
      timeout,
    );
    utxo.privateKey = secp256k1.utils.randomPrivateKey();

    try {
      await refundSwap([utxo], timeout);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe(-26);
      expect(error.message).toContain(
        'mempool-script-verify-flag-failed (Invalid Schnorr signature)',
      );
    }
  });
});
