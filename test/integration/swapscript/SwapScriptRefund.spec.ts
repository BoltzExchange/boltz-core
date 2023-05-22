import { RefundDetails } from '../../../lib/consts/Types';
import { bitcoinClient, createSwapOutput, destinationOutput } from '../Utils';
import {
  constructRefundTransaction,
  OutputType,
  swapScript,
  targetFee,
} from '../../../lib/Boltz';

describe('SwapScript refund', () => {
  let bestBlockHeight: number;

  const refundSwaps = async (refundDetails: RefundDetails[]) => {
    const refundTransaction = targetFee(1, (fee) =>
      constructRefundTransaction(
        refundDetails,
        destinationOutput,
        bestBlockHeight,
        fee,
      ),
    );

    await bitcoinClient.sendRawTransaction(refundTransaction.toHex());
  };

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
    await refundSwaps([utxo]);
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
    await expect(refundSwaps([utxo])).rejects.toEqual({
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

    await refundSwaps(outputs.map((output) => output.utxo));
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });
});
