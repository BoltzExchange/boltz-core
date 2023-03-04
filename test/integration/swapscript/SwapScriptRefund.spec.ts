import { refundDetails } from './SwapScript.spec';
import { destinationOutput, bitcoinClient } from '../Utils';
import { RefundDetails } from '../../../lib/consts/Types';
import { constructRefundTransaction } from '../../../lib/Boltz';

describe('SwapScript refund', () => {
  let bestBlockHeight: number;

  const refundSwap = async (refundDetails: RefundDetails) => {
    const refundTransaction = constructRefundTransaction(
      [refundDetails],
      destinationOutput,
      bestBlockHeight,
      1,
    );

    await bitcoinClient.sendRawTransaction(refundTransaction.toHex());
  };

  beforeAll(async () => {
    const { blocks } = await bitcoinClient.getBlockchainInfo();

    // Although it is possible that the height of the best block is not the height at which
    // the HTLC times out one can assume that the best block is already after the timeout
    bestBlockHeight = blocks;
  });

  test('should refund a P2WSH swap', async () => {
    await refundSwap(refundDetails[0]);
  });

  test('should refund a P2SH swap', async () => {
    await refundSwap(refundDetails[1]);
  });

  test('should refund a P2SH nested P2WSH swap', async () => {
    await refundSwap(refundDetails[2]);
  });

  test('should refund multiple swaps in one transaction', async () => {
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
