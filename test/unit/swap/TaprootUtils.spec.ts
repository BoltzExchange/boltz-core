import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { Script, type ScriptType } from '@scure/btc-signer';
import { TAP_LEAF_VERSION } from '@scure/btc-signer/payment.js';
import zkp from '@vulpemventures/secp256k1-zkp';
import { tapTweakHash } from 'bitcoinjs-lib/src/payments/bip341';
import { randomBytes } from 'node:crypto';
import type { TapLeaf, TapTree } from '../../../lib/consts/Types';
import * as Musig from '../../../lib/musig/Musig';
import {
  TAP_LEAF_VERSION_LIQUID,
  createControlBlock,
  createLeaf,
  swapLeafsToTree,
  taprootHashTree,
  toXOnly,
  tweakMusig,
} from '../../../lib/swap/TaprootUtils';

describe('TaprootUtils', () => {
  const taptree: TapTree = [
    createLeaf(false, [
      'SHA256',
      hex.decode(
        '306aa146fd8a292d785d4d3556e2357bbf169be69e9078a857f497e84330403e',
      ),
      'EQUALVERIFY',
    ]),
    createLeaf(false, [
      toXOnly(
        hex.decode(
          '023c71ff885c06dc7c08a7e56dfb2b4dad602d32d227f590850d7c3cd9a5fb8f4d',
        ),
      ),
      'CHECKSIGVERIFY',
    ]),
  ];

  describe('toXOnly', () => {
    test('should return 32-byte key as-is', () => {
      const key = randomBytes(32);
      expect(toXOnly(key)).toBe(key);
    });

    test('should return x-only key for 33-byte key', () => {
      const key = randomBytes(33);
      const expected = key.subarray(1, 33);
      expect(toXOnly(key)).toEqual(expected);
    });
  });

  test('should convert swap leafs to a tree', () => {
    const tree = swapLeafsToTree(
      taptree[0] as TapLeaf,
      taptree[1] as TapLeaf,
    ) as [TapLeaf, TapLeaf];

    expect(tree.length).toEqual(2);
    expect(tree[0]).toEqual(taptree[0]);
    expect(tree[1]).toEqual(taptree[1]);
  });

  test.each`
    isLiquid | version
    ${false} | ${TAP_LEAF_VERSION}
    ${true}  | ${TAP_LEAF_VERSION_LIQUID}
  `('should create leafs (isLiquid: $isLiquid)', ({ isLiquid, version }) => {
    const script = [
      'SHA256',
      randomBytes(32),
      'EQUALVERIFY',
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      'CHECKSIGVERIFY',
    ] as ScriptType;

    const leaf = createLeaf(isLiquid, script);
    expect(leaf.version).toEqual(version);
    expect(leaf.output).toEqual(Script.encode(script));
  });

  test('should tweak Musig', async () => {
    const secp = await zkp();
    const ourMusigKey = secp256k1.utils.randomPrivateKey();

    const musig = Musig.create(
      ourMusigKey,
      [
        ourMusigKey,
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key)),
    );
    const tweakedMusig = tweakMusig(musig, taptree);

    expect(Buffer.from(tweakedMusig.aggPubkey)).toEqual(
      Buffer.from(
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(Buffer.from(musig.aggPubkey)),
          tapTweakHash(
            Buffer.from(musig.aggPubkey),
            Buffer.from(taprootHashTree(taptree).hash),
          ),
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should create control blocks', () => {
    const internalKey = toXOnly(
      hex.decode(
        '039413e70e5c8ff888184f504561c5d3a51aac29e18ca1e70aed38c5ac91cb9a3c',
      ),
    );
    const controlBlock = createControlBlock(
      taprootHashTree(taptree),
      taptree[0] as TapLeaf,
      internalKey,
    );
    expect(controlBlock).toMatchSnapshot();
  });

  test('should not create control blocks when leaf is not in tree', () => {
    expect(() =>
      createControlBlock(
        taprootHashTree(taptree),
        createLeaf(false, ['RIPEMD160', randomBytes(20), 'EQUALVERIFY']),
        toXOnly(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey())),
      ),
    ).toThrow('leaf not in tree');
  });
});
