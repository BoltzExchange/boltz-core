import { RefundDetails } from '../../../lib/consts/Types';
import { bitcoinClient, refundDetails, destinationOutput } from './Swap.spec';
import { constructRefundTransaction } from '../../../lib/Boltz';

describe('Refund', () => {
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

  before(async () => {
    const { blocks } = await bitcoinClient.getBlockchainInfo();

    // Although it is possible that the height of the best block is not the height at which
    // the HTLC times out one can assume that the best block is already after the timeout
    bestBlockHeight = blocks;
  });

  it('should refund a P2WSH swap', async () => {
    await refundSwap(refundDetails[0]);
  });

  it('should refund a P2SH swap', async () => {
    await refundSwap(refundDetails[1]);
  });

  it('should refund a P2SH nested P2WSH swap', async () => {
    await refundSwap(refundDetails[2]);
  });

  it('should refund multiple swaps in one transaction', async () => {
    const refundTransaction = constructRefundTransaction(
      refundDetails.slice(3, 6),
      destinationOutput,
      bestBlockHeight,
      1,
    );

    await bitcoinClient.sendRawTransaction(refundTransaction.toHex());
  });

  after(async () => {
    await bitcoinClient.generate(1);
  });
});
