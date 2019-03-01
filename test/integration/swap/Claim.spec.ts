import { ClaimDetails } from '../../../lib/consts/Types';
import { bitcoinClient, claimDetails, destinationOutput } from './Swap.spec';
import { constructClaimTransaction } from '../../../lib/Boltz';

describe('Claim', () => {
  const claimSwap = async (claimDetails: ClaimDetails) => {
    const claimTransaction = constructClaimTransaction(
      [claimDetails],
      destinationOutput,
      1,
      true,
    );

    await bitcoinClient.sendRawTransaction(claimTransaction.toHex());
  };

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
      destinationOutput,
      1,
      false,
    );

    await bitcoinClient.sendRawTransaction(claimTransaction.toHex());
  });

  after(async () => {
    await bitcoinClient.generate(1);
  });
});
