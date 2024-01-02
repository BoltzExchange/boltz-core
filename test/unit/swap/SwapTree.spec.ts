import { randomBytes } from 'crypto';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPair } from '../Utils';
import {
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  swapTree,
} from '../../../lib/Boltz';

describe('SwapTree', () => {
  test('should extract claim public key from swap tree', () => {
    const claimKeys = ECPair.makeRandom();

    const tree = swapTree(
      false,
      randomBytes(32),
      claimKeys.publicKey,
      ECPair.makeRandom().publicKey,
      123,
    );

    expect(extractClaimPublicKeyFromSwapTree(tree)).toEqual(
      toXOnly(claimKeys.publicKey),
    );
  });

  test('should extract refund public key from swap tree', () => {
    const refundKeys = ECPair.makeRandom();

    const tree = swapTree(
      false,
      randomBytes(32),
      ECPair.makeRandom().publicKey,
      refundKeys.publicKey,
      123,
    );

    expect(extractRefundPublicKeyFromSwapTree(tree)).toEqual(
      toXOnly(refundKeys.publicKey),
    );
  });
});
