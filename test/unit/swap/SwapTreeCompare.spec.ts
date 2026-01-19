import { secp256k1 } from '@noble/curves/secp256k1.js';
import { randomBytes } from 'node:crypto';
import swapTree from '../../../lib/swap/SwapTree';
import { compareTrees } from '../../../lib/swap/SwapTreeCompare';

describe('SwapTreeCompare', () => {
  const claimKey = secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey());
  const refundKey = secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey());

  test('should compare SwapTrees', () => {
    const preimageHash = randomBytes(32);
    const timeoutBlockHeight = 123;

    expect(
      compareTrees(
        swapTree(false, preimageHash, claimKey, refundKey, timeoutBlockHeight),
        swapTree(false, preimageHash, claimKey, refundKey, timeoutBlockHeight),
      ),
    ).toEqual(true);
  });

  test('should return false on version mismatch', () => {
    const preimageHash = randomBytes(32);
    const timeoutBlockHeight = 123;

    expect(
      compareTrees(
        swapTree(true, preimageHash, claimKey, refundKey, timeoutBlockHeight),
        swapTree(false, preimageHash, claimKey, refundKey, timeoutBlockHeight),
      ),
    ).toEqual(false);
  });

  test('should return false on script mismatch', () => {
    const preimageHash = randomBytes(32);
    const timeoutBlockHeight = 123;

    expect(
      compareTrees(
        swapTree(true, preimageHash, claimKey, refundKey, timeoutBlockHeight),
        swapTree(
          true,
          randomBytes(32),
          claimKey,
          refundKey,
          timeoutBlockHeight,
        ),
      ),
    ).toEqual(false);
  });

  test('should return false on depth mismatch', () => {
    const preimageHash = randomBytes(32);
    const timeoutBlockHeight = 123;

    const compare = swapTree(
      false,
      preimageHash,
      claimKey,
      refundKey,
      timeoutBlockHeight,
    );
    compare.tree = compare.claimLeaf;

    expect(
      compareTrees(
        swapTree(false, preimageHash, claimKey, refundKey, timeoutBlockHeight),
        compare,
      ),
    ).toEqual(false);
  });
});
