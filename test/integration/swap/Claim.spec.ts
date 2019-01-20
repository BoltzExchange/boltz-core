import { btcd, claimDetails } from './Swap.spec';
import { UtxoManager } from './utils/UtxoManager';
import { ClaimDetails } from '../../../lib/consts/Types';
import { constructClaimTransaction } from '../../../lib/Boltz';

describe('Claim', () => {
  const claimSwap = async (claimDetails: ClaimDetails) => {
    const claimTransaction = constructClaimTransaction(
      [claimDetails],
      UtxoManager.outputScript,
      1,
      true,
    );

    await btcd.sendRawTransaction(claimTransaction.toHex());
  };

  before(async () => {
    await btcd.connect();
  });

  it('should claim a P2WSH swap', async () => {
    await claimSwap(claimDetails[0]);
  });

  it('should claim a P2SH swap', async () => {
    await claimSwap(claimDetails[1]);
  });

  it('should claim a P2SH nested P2WSH swap', async () => {
    await claimSwap(claimDetails[2]);
  });

  it('should claim multiple swaps in one transaction', async () => {
    const claimTransaction = constructClaimTransaction(
      claimDetails.slice(3, 6),
      UtxoManager.outputScript,
      1,
      false,
    );

    await btcd.sendRawTransaction(claimTransaction.toHex());
  });

  after(async () => {
    await btcd.generate(1);

    btcd.disconnect();
  });
});
