import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from 'crypto';
import {
  extractClaimPublicKeyFromReverseSwapTree,
  extractRefundPublicKeyFromReverseSwapTree,
  reverseSwapTree,
} from '../../../lib/Boltz';
import { toXOnly } from '../../../lib/swap/TaprootUtils';

describe('ReverseSwapTree', () => {
  test('should extract claim public key from swap tree', () => {
    const claimKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );

    const tree = reverseSwapTree(
      false,
      randomBytes(32),
      claimKeys,
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      123,
    );

    expect(extractClaimPublicKeyFromReverseSwapTree(tree)).toEqual(
      toXOnly(claimKeys),
    );
  });

  test('should extract refund public key from swap tree', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );

    const tree = reverseSwapTree(
      false,
      randomBytes(32),
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      refundKeys,
      123,
    );

    expect(extractRefundPublicKeyFromReverseSwapTree(tree)).toEqual(
      toXOnly(refundKeys),
    );
  });
});
