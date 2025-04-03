import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { randomBytes } from 'crypto';
import {
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  swapTree,
} from '../../../lib/Boltz';
import { ECPair } from '../Utils';

describe('SwapTree', () => {
  test('should extract claim public key from swap tree', () => {
    const claimKeys = Buffer.from(ECPair.makeRandom().publicKey);

    const tree = swapTree(
      false,
      randomBytes(32),
      claimKeys,
      Buffer.from(ECPair.makeRandom().publicKey),
      123,
    );

    expect(extractClaimPublicKeyFromSwapTree(tree)).toEqual(toXOnly(claimKeys));
  });

  test('should extract refund public key from swap tree', () => {
    const refundKeys = Buffer.from(ECPair.makeRandom().publicKey);

    const tree = swapTree(
      false,
      randomBytes(32),
      Buffer.from(ECPair.makeRandom().publicKey),
      refundKeys,
      123,
    );

    expect(extractRefundPublicKeyFromSwapTree(tree)).toEqual(
      toXOnly(refundKeys),
    );
  });
});
