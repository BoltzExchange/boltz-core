import { btcd, refundDetails } from './Swap.spec';
import { UtxoManager } from './utils/UtxoManager';
import { RefundDetails } from '../../../lib/consts/Types';
import { constructRefundTransaction } from '../../../lib/Boltz';

describe('Refund', () => {
  let bestBlockHeight: number;

  const refundSwap = async (refundDetails: RefundDetails) => {
    const refundTransaction = constructRefundTransaction(
      [refundDetails],
      UtxoManager.outputScript,
      bestBlockHeight,
      1,
    );

    await btcd.sendRawTransaction(refundTransaction.toHex());
  };

  before(async () => {
    await btcd.connect();

    const { height } = await btcd.getBestBlock();

    // Although it is possible that the height of the best block is not the height at which
    // the HTLC times out one can assume that the best block is already after the timeout
    bestBlockHeight = height;
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
      UtxoManager.outputScript,
      bestBlockHeight,
      1,
    );

    await btcd.sendRawTransaction(refundTransaction.toHex());
  });

  after(async () => {
    await btcd.generate(1);

    btcd.disconnect();
  });
});
