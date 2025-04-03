import { randomBytes } from 'crypto';
import { networks } from 'liquidjs-lib';
import { Feature, reverseSwapTree } from '../../../../lib/liquid';
import { p2trOutput } from '../../../../lib/swap/Scripts';
import { ECPair } from '../../Utils';

describe('ReverseSwapTree', () => {
  test('should throw with duplicate features', () => {
    expect(() =>
      reverseSwapTree(
        randomBytes(32),
        Buffer.from(ECPair.makeRandom().publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
        123,
        [
          {
            type: Feature.ClaimCovenant,
            expectedAmount: 123,
            assetHash: networks.regtest.assetHash,
            outputScript: p2trOutput(
              Buffer.from(ECPair.makeRandom().publicKey),
            ),
          },
          {
            type: Feature.ClaimCovenant,
            expectedAmount: 123,
            assetHash: networks.regtest.assetHash,
            outputScript: p2trOutput(
              Buffer.from(ECPair.makeRandom().publicKey),
            ),
          },
        ],
      ),
    ).toThrow('duplicate feature');
  });

  test('should throw with unknown features', () => {
    const feature = 'not found';

    expect(() =>
      reverseSwapTree(
        randomBytes(32),
        Buffer.from(ECPair.makeRandom().publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
        123,
        [
          {
            type: feature,
          } as any,
        ],
      ),
    ).toThrow(`unknown feature: ${feature}`);
  });
});
