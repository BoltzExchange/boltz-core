import { randomBytes } from 'crypto';
import ops from '@boltz/bitcoin-ops';
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';
import zkp from '@michael1011/secp256k1-zkp';
import { Taptree } from 'bitcoinjs-lib/src/types';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { findScriptPath as liquidFindScriptPath } from 'liquidjs-lib/src/bip341';
import { ECPair } from '../../Utils';
import { init } from '../../../../lib/liquid';
import Musig from '../../../../lib/musig/Musig';
import { secp } from '../../../../lib/liquid/init';
import { getHexBuffer } from '../../../../lib/Utils';
import { Tapleaf } from '../../../../lib/consts/Types';
import { createLeaf } from '../../../../lib/swap/TaprootUtils';
import {
  createControlBlock,
  tapLeafHash,
  tapTweakHash,
  toHashTree,
  tweakMusig,
} from '../../../../lib/liquid/swap/TaprooUtils';

describe('TaprootUtils', () => {
  const key = ECPair.fromPrivateKey(
    getHexBuffer(
      '87ca03c7557e262775987404c3f07d43b7331721f2916324b53e90e3541132c5',
    ),
  );
  const bytes = getHexBuffer(
    '6ca8dbc536d5ffbe22af6e8034840cdc305fea9d2bdea252d378d7db9bb77882',
  );

  const taptree: Taptree = [
    createLeaf(true, [ops.OP_SHA256, bytes, ops.OP_EQUALVERIFY]),
    createLeaf(true, [key.publicKey, ops.OP_CHECKSIGVERIFY]),
  ];

  beforeAll(async () => {
    init(await zkp());
  });

  test('should hash tap leafs', () => {
    const hash = tapLeafHash(taptree[0] as Tapleaf);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash).toMatchSnapshot();
  });

  test('should hash tap tweaks', () => {
    const tweak = tapTweakHash(key.publicKey, bytes);
    expect(tweak).toBeInstanceOf(Buffer);
    expect(tweak).toMatchSnapshot();
  });

  test('should convert taproot tree to hash tree', () => {
    const hashTree = toHashTree(taptree);
    expect(hashTree).toBeDefined();
    expect(hashTree).toMatchSnapshot();
  });

  test('should tweak Musig', async () => {
    const secp = await zkp();
    const ourMusigKey = ECPair.makeRandom();

    const musig = new Musig(secp, ourMusigKey, randomBytes(32), [
      ourMusigKey.publicKey,
      ECPair.makeRandom().publicKey,
    ]);
    const tweakedKey = tweakMusig(musig, taptree);

    expect(tweakedKey).toEqual(
      Buffer.from(
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(musig.getAggregatedPublicKey()),
          tapTweakHash(
            musig.getAggregatedPublicKey(),
            toHashTree(taptree).hash,
          ),
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should create control blocks', () => {
    initEccLib(ecc);

    const internalKey = toXOnly(ECPair.makeRandom().publicKey);
    const controlBlock = createControlBlock(
      toHashTree(taptree),
      taptree[0] as Tapleaf,
      internalKey,
    );

    const hashTree = toHashTree(taptree);
    expect(controlBlock).toEqual(
      Buffer.concat(
        [
          Buffer.from([
            (taptree[0] as Tapleaf).version |
              secp.ecc.xOnlyPointAddTweak(
                internalKey,
                tapTweakHash(internalKey, hashTree.hash),
              )!.parity,
          ]),
          internalKey,
        ].concat(
          liquidFindScriptPath(hashTree, tapLeafHash(taptree[0] as Tapleaf))!,
        ),
      ),
    );
  });

  test('should not create control blocks when leaf is not in tree', () => {
    expect(() =>
      createControlBlock(
        toHashTree(taptree),
        createLeaf(false, [
          ops.OP_RIPEMD160,
          randomBytes(20),
          ops.OP_EQUALVERIFY,
        ]),
        toXOnly(ECPair.makeRandom().publicKey),
      ),
    ).toThrow('leaf not in tree');
  });
});
