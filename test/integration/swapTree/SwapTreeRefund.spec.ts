import { ECPair } from '../../unit/Utils';
import swapTree from '../../../lib/swap/SwapTree';
import { OutputType } from '../../../lib/consts/Enums';
import { bitcoinClient, createSwapOutput, init, refundSwap } from '../Utils';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';

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
    await expect(refundSwap([utxo], timeout)).rejects.toEqual({
      code: -26,
      message:
        'non-mandatory-script-verify-flag (Locktime requirement not satisfied)',
    });
  });

  test('should not refund via script path when refund key is invalid', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      true,
      treeFunc,
      timeout,
    );
    utxo.keys = ECPair.makeRandom();

    await expect(refundSwap([utxo], timeout)).rejects.toEqual({
      code: -26,
      message: 'non-mandatory-script-verify-flag (Invalid Schnorr signature)',
    });
  });
});
