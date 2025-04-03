import { randomBytes } from 'crypto';
import swapTree from '../../../lib/swap/SwapTree';
import { compareTrees } from '../../../lib/swap/SwapTreeCompare';
import { ECPair } from '../Utils';

describe('SwapTreeCompare', () => {
  test('should compare SwapTrees', () => {
    const preimageHash = randomBytes(32);
    const claimKey = Buffer.from(ECPair.makeRandom().publicKey);
    const refundKey = Buffer.from(ECPair.makeRandom().publicKey);
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
    const claimKey = Buffer.from(ECPair.makeRandom().publicKey);
    const refundKey = Buffer.from(ECPair.makeRandom().publicKey);
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
    const claimKey = Buffer.from(ECPair.makeRandom().publicKey);
    const refundKey = Buffer.from(ECPair.makeRandom().publicKey);
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
    const claimKey = Buffer.from(ECPair.makeRandom().publicKey);
    const refundKey = Buffer.from(ECPair.makeRandom().publicKey);
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
