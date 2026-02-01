import ops from '@boltz/bitcoin-ops';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import zkp from '@vulpemventures/secp256k1-zkp';
import { findScriptPath as liquidFindScriptPath } from 'liquidjs-lib/src/bip341';
import { randomBytes } from 'node:crypto';
import type { TapLeaf, TapTree } from '../../../../lib/consts/Types';
import { init } from '../../../../lib/liquid';
import { secp } from '../../../../lib/liquid/init';
import {
  createControlBlock,
  tapLeafHash,
  tapTweakHash,
  toHashTree,
  tweakMusig,
} from '../../../../lib/liquid/swap/TaprootUtils';
import * as Musig from '../../../../lib/musig/Musig';
import { fundingAddressTree } from '../../../../lib/swap/SwapTree';
import { createLeaf, toXOnly } from '../../../../lib/swap/TaprootUtils';

describe('TaprootUtils', () => {
  const publicKey = secp256k1.getPublicKey(
    hex.decode(
      '87ca03c7557e262775987404c3f07d43b7331721f2916324b53e90e3541132c5',
    ),
  );
  const bytes = hex.decode(
    '6ca8dbc536d5ffbe22af6e8034840cdc305fea9d2bdea252d378d7db9bb77882',
  );

  const taptree: TapTree = [
    createLeaf(true, ['SHA256', bytes, 'EQUALVERIFY']),
    createLeaf(true, [publicKey, 'CHECKSIGVERIFY']),
  ];

  beforeAll(async () => {
    init(await zkp());
  });

  test('should hash tap leaf', () => {
    const hash = tapLeafHash(taptree[0] as TapLeaf);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash).toMatchSnapshot();
  });

  test('should hash tap tweaks', () => {
    const tweak = tapTweakHash(Buffer.from(publicKey), Buffer.from(bytes));
    expect(tweak).toBeInstanceOf(Buffer);
    expect(tweak).toMatchSnapshot();
  });

  test('should convert taproot tree to hash tree', () => {
    const hashTree = toHashTree(taptree);
    expect(hashTree).toBeDefined();
    expect(hashTree).toMatchSnapshot();
  });

  test('should convert nested taproot tree to hash tree', () => {
    const hashTree = toHashTree([taptree, taptree]);
    expect(hashTree).toBeDefined();
    expect(hashTree).toMatchSnapshot();
  });

  test('should tweak Musig', async () => {
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
          toXOnly(musig.aggPubkey),
          tapTweakHash(Buffer.from(musig.aggPubkey), toHashTree(taptree).hash),
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should tweak Musig with FundingAddressTree', async () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(true, refundKeys, timeoutBlockHeight);

    const ourMusigKey = secp256k1.utils.randomPrivateKey();
    const musig = Musig.create(
      ourMusigKey,
      [ourMusigKey, secp256k1.utils.randomPrivateKey()].map((key) =>
        secp256k1.getPublicKey(key),
      ),
    );

    const tweakedMusig = tweakMusig(musig, tree.tree);

    expect(Buffer.from(tweakedMusig.aggPubkey)).toEqual(
      Buffer.from(
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(musig.aggPubkey),
          tapTweakHash(
            Buffer.from(musig.aggPubkey),
            toHashTree(tree.tree).hash,
          ),
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should create control blocks', () => {
    const internalKey = toXOnly(
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
    );
    const controlBlock = createControlBlock(
      toHashTree(taptree),
      taptree[0] as TapLeaf,
      Buffer.from(internalKey),
    );

    const hashTree = toHashTree(taptree);
    expect(controlBlock).toEqual(
      Buffer.concat(
        [
          Buffer.from([
            (taptree[0] as TapLeaf).version |
              secp.ecc.xOnlyPointAddTweak(
                internalKey,
                tapTweakHash(Buffer.from(internalKey), hashTree.hash),
              )!.parity,
          ]),
          internalKey,
        ].concat(
          liquidFindScriptPath(hashTree, tapLeafHash(taptree[0] as TapLeaf))!,
        ),
      ),
    );
  });

  test('should not create control blocks when leaf is not in tree', () => {
    expect(() =>
      createControlBlock(
        toHashTree(taptree),
        createLeaf(true, [
          ops.OP_RIPEMD160,
          randomBytes(20),
          ops.OP_EQUALVERIFY,
        ]),
        Buffer.from(
          toXOnly(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey())),
        ),
      ),
    ).toThrow('leaf not in tree');
  });

  test('should create control blocks with FundingAddressTree (single-leaf tree)', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(true, refundKeys, timeoutBlockHeight);
    const hashTree = toHashTree(tree.tree);

    const internalKey = toXOnly(
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
    );

    const controlBlock = createControlBlock(
      hashTree,
      tree.refundLeaf,
      Buffer.from(internalKey),
    );

    // For a single-leaf tree, the path is empty, so the control block should be:
    // [version | parity] + internalKey (no path elements)
    const tweakResult = secp.ecc.xOnlyPointAddTweak(
      internalKey,
      tapTweakHash(Buffer.from(internalKey), hashTree.hash),
    )!;

    expect(controlBlock).toEqual(
      Buffer.concat([
        Buffer.from([tree.refundLeaf.version | tweakResult.parity]),
        internalKey,
      ]),
    );
    expect(controlBlock.length).toEqual(33);
  });
});
