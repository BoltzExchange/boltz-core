import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from 'crypto';
import { networks } from 'liquidjs-lib';
import { Feature, reverseSwapTree } from '../../../../lib/liquid';
import { p2trOutput } from '../../../../lib/swap/Scripts';

describe('ReverseSwapTree', () => {
  test('should throw with duplicate features', () => {
    expect(() =>
      reverseSwapTree(
        randomBytes(32),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        123,
        [
          {
            type: Feature.ClaimCovenant,
            expectedAmount: 123,
            assetHash: networks.regtest.assetHash,
            outputScript: Buffer.from(
              p2trOutput(
                secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
              ),
            ),
          },
          {
            type: Feature.ClaimCovenant,
            expectedAmount: 123,
            assetHash: networks.regtest.assetHash,
            outputScript: Buffer.from(
              p2trOutput(
                secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
              ),
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
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
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
