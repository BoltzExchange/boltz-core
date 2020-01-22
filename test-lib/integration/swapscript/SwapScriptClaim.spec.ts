import { randomBytes } from 'crypto';
import { claimDetails } from './SwapScript.spec';
import { constructClaimTransaction } from '../../../lib/Boltz';
import { bitcoinClient, destinationOutput, claimSwap } from '../Utils';

describe('SwapScript claim', () => {
  test('should not claim swaps if the preimage has an invalid hash', async () => {
    let actualError: any;

    try {
      const toClaim = {
        ...claimDetails[0],
      };
      toClaim.preimage = randomBytes(32);

      await claimSwap(toClaim);
    } catch (error) {
      actualError = error;
    }

    expect(actualError.code).toEqual(-26);
    expect(actualError.message).toEqual('mandatory-script-verify-flag-failed (Locktime requirement not satisfied) (code 16)');
  });

  test('should claim a P2WSH swap', async () => {
    await claimSwap(claimDetails[0]);
  });

  test('should claim a P2SH swap', async () => {
    await claimSwap(claimDetails[1]);
  });

  test('should claim a P2SH nested P2WSH swap', async () => {
    await claimSwap(claimDetails[2]);
  });

  test('should claim multiple swaps in one transaction', async () => {
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
