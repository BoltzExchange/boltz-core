import { constructClaimTransaction } from '../../../../lib/Boltz';
import { bitcoinClient, destinationOutput, claimSwap } from '../Utils';
import { claimDetails, invalidPreimageLengthSwap } from './ReverseSwapScript.spec';

describe('ReverseSwapScript claim', () => {
  test('should not claim reverse swap if the preimage has an invalid length', async () => {
    try {
      await claimSwap(invalidPreimageLengthSwap);
    } catch (error) {
      // If the preimage has in invalid length the refund key is loaded and the signature is verified against it
      expect(error.code).toEqual(-26);
      expect(error.message).toEqual('non-mandatory-script-verify-flag (Locktime requirement not satisfied) (code 64)');
    }
  });

  test('should claim a P2WSH reverse swap', async () => {
    await claimSwap(claimDetails[0]);
  });

  test('should claim a P2SH reverse swap', async () => {
    await claimSwap(claimDetails[1]);
  });

  test('should claim a P2SH nested P2WSH reverse swap', async () => {
    await claimSwap(claimDetails[2]);
  });

  test('should claim multiple reverse swaps in one transaction', async () => {
    const claimTransaction = constructClaimTransaction(
      claimDetails.slice(3, 6),
      destinationOutput,
      1,
      false,
    );

    await bitcoinClient.sendRawTransaction(claimTransaction.toHex());
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });
});
