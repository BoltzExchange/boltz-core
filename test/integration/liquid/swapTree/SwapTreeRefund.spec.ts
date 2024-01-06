import zkp from '@vulpemventures/secp256k1-zkp';
import { OutputType } from '../../../../lib/consts/Enums';
import { init } from '../../../../lib/liquid';
import reverseSwapTree from '../../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../../lib/swap/SwapTree';
import { slip77 } from '../../../unit/Utils';
import {
  createSwapOutput,
  destinationOutput,
  elementsClient,
  refundSwap,
  init as utilsInit,
} from '../../Utils';

describe.each`
  name                 | treeFunc           | blindInputs | blindOutput
  ${'SwapTree'}        | ${swapTree}        | ${false}    | ${false}
  ${'SwapTree'}        | ${swapTree}        | ${false}    | ${true}
  ${'SwapTree'}        | ${swapTree}        | ${true}     | ${false}
  ${'SwapTree'}        | ${swapTree}        | ${true}     | ${true}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${false}    | ${false}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${false}    | ${true}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${true}     | ${false}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${true}     | ${true}
`(
  '$name refund (inputs blinded $blindInputs; output blinded $blindOutput)',
  ({ treeFunc, blindInputs, blindOutput }) => {
    beforeAll(async () => {
      init(await zkp());
      await Promise.all([utilsInit(), elementsClient.init()]);
    });

    afterEach(async () => {
      await elementsClient.generate(1);
    });

    test('should refund via script path', async () => {
      const timeout = (await elementsClient.getBlockchainInfo()).blocks;
      const { utxo } = await createSwapOutput(
        OutputType.Taproot,
        true,
        treeFunc,
        timeout,
        blindInputs,
      );
      await refundSwap(
        [utxo],
        timeout,
        blindOutput ? slip77.derive(destinationOutput).publicKey! : undefined,
      );
    });
  },
);
