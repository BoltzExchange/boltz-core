import { randomBytes } from 'crypto';
import { constructClaimTransaction } from '../../../lib/Boltz';
import { bitcoinClient, destinationOutput, claimSwap } from '../Utils';
import { claimDetails, invalidPreimageLengthSwap } from './ReverseSwapScript.spec';

describe('ReverseSwapScript claim', () => {
  test('should not claim reverse swaps if the preimage has an invalid length', async () => {
    let actualError: any;

    try {
      await claimSwap(invalidPreimageLengthSwap);
    } catch (error) {
      // If the preimage has in invalid length the refund key is loaded and the signature is verified against it
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toEqual('non-mandatory-script-verify-flag (Locktime requirement not satisfied)');
  });

  test('should not claim reverse swaps if the preimage has a valid length but an invalid hash', async () => {
    let actualError: any;

    try {
      const toClaim = {
        ...invalidPreimageLengthSwap,
      };
      toClaim.preimage = randomBytes(32);

      await claimSwap(toClaim);
    } catch (error) {
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toEqual('non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)');
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
