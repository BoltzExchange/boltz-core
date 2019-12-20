import { refundDetails } from './ReverseSwapScript.spec';
import { constructRefundTransaction } from '../../../../lib/Boltz';
import { destinationOutput, bitcoinClient, refundSwap } from '../Utils';

describe('ReverseSwapScript refund', () => {
  let bestBlockHeight: number;

  beforeAll(async () => {
    const { blocks } = await bitcoinClient.getBlockchainInfo();

    // Although it is possible that the height of the best block is not the height at which
    // the HTLC times out one can assume that the best block is already after the timeout
    bestBlockHeight = blocks;
  });

  test('should refund a P2WSH reverse swap', async () => {
    await refundSwap(refundDetails[0], bestBlockHeight);
  });

  test('should refund a P2SH reverse swap', async () => {
    await refundSwap(refundDetails[1], bestBlockHeight);
  });

  test('should refund a P2SH nested P2WSH reverse swap', async () => {
    await refundSwap(refundDetails[2], bestBlockHeight);
  });

  test('should refund multiple reverse swaps in one transaction', async () => {
    const refundTransaction = constructRefundTransaction(
      refundDetails.slice(3, 6),
      destinationOutput,
      bestBlockHeight,
      1,
    );

    await bitcoinClient.sendRawTransaction(refundTransaction.toHex());
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });
});
