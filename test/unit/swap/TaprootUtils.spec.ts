import ops from '@boltz/bitcoin-ops';
import zkp from '@vulpemventures/secp256k1-zkp';
import { Transaction, initEccLib } from 'bitcoinjs-lib';
import {
  LEAF_VERSION_TAPSCRIPT,
  findScriptPath,
  tapTweakHash,
  tapleafHash,
  toHashTree,
  tweakKey,
} from 'bitcoinjs-lib/src/payments/bip341';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import type { Taptree } from 'bitcoinjs-lib/src/types';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import type { RefundDetails, Tapleaf } from '../../../lib/consts/Types';
import Musig from '../../../lib/musig/Musig';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { toPushdataScript } from '../../../lib/swap/SwapUtils';
import {
  createControlBlock,
  createLeaf,
  hashForWitnessV1,
  leafVersionLiquid,
  swapLeafsToTree,
  tweakMusig,
} from '../../../lib/swap/TaprootUtils';
import { ECPair } from '../Utils';

describe('TaprootUtils', () => {
  const taptree: Taptree = [
    createLeaf(false, [ops.OP_SHA256, randomBytes(32), ops.OP_EQUALVERIFY]),
    createLeaf(false, [
      Buffer.from(ECPair.makeRandom().publicKey),
      ops.OP_CHECKSIGVERIFY,
    ]),
  ];

  test('should convert swap leafs to a tree', () => {
    const tree = swapLeafsToTree(
      taptree[0] as Tapleaf,
      taptree[1] as Tapleaf,
    ) as [Tapleaf, Tapleaf];

    expect(tree.length).toEqual(2);
    expect(tree[0]).toEqual(taptree[0]);
    expect(tree[1]).toEqual(taptree[1]);
  });

  test.each`
    isLiquid | version
    ${false} | ${LEAF_VERSION_TAPSCRIPT}
    ${true}  | ${leafVersionLiquid}
  `('should create leafs (isLiquid: $isLiquid)', ({ isLiquid, version }) => {
    const script = [
      ops.OP_SHA256,
      randomBytes(32),
      ops.OP_EQUALVERIFY,
      Buffer.from(ECPair.makeRandom().publicKey),
      ops.OP_CHECKSIGVERIFY,
    ];

    const leaf = createLeaf(isLiquid, script);
    expect(leaf.version).toEqual(version);
    expect(leaf.output).toEqual(toPushdataScript(script));
  });

  test('should tweak Musig', async () => {
    const secp = await zkp();
    const ourMusigKey = ECPair.makeRandom();

    const musig = new Musig(
      ourMusigKey,
      [
        Buffer.from(ourMusigKey.publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
      ],
      randomBytes(32),
    );
    const tweakedMusig = tweakMusig(musig, taptree);

    expect(Buffer.from(tweakedMusig.pubkeyAgg)).toEqual(
      Buffer.from(
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(Buffer.from(musig.pubkeyAgg)),
          tapTweakHash(Buffer.from(musig.pubkeyAgg), toHashTree(taptree).hash),
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should create control blocks', () => {
    initEccLib(ecc);

    const internalKey = toXOnly(Buffer.from(ECPair.makeRandom().publicKey));
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
              tweakKey(internalKey, hashTree.hash)!.parity,
          ]),
          internalKey,
        ].concat(findScriptPath(hashTree, tapleafHash(taptree[0] as Tapleaf))!),
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
        toXOnly(Buffer.from(ECPair.makeRandom().publicKey)),
      ),
    ).toThrow('leaf not in tree');
  });

  test.each`
    sigHash                        | sigHashExpected
    ${Transaction.SIGHASH_DEFAULT} | ${Transaction.SIGHASH_DEFAULT}
    ${undefined}                   | ${Transaction.SIGHASH_DEFAULT}
    ${Transaction.SIGHASH_ALL}     | ${Transaction.SIGHASH_ALL}
  `('should hash for witness v1', ({ sigHash, sigHashExpected }) => {
    const index = 2;
    const details = [
      {
        script: randomBytes(32),
        value: 1,
      },
      {
        script: randomBytes(32),
        value: 2,
      },
      {
        script: randomBytes(32),
        value: 3,
      },
    ] as RefundDetails[];

    const tx = new Transaction();

    tx.addInput(randomBytes(32), 0);
    tx.addInput(randomBytes(32), 1);
    tx.addInput(randomBytes(32), 2);

    tx.addOutput(
      p2trOutput(Buffer.from(ECPair.makeRandom().publicKey)),
      details.reduce((sum, entry) => sum + entry.value, 0),
    );

    const leafHash = tapleafHash(taptree[0] as Tapleaf);

    expect(hashForWitnessV1(details, tx, index, leafHash, sigHash)).toEqual(
      tx.hashForWitnessV1(
        index,
        details.map((detail) => detail.script),
        details.map((detail) => detail.value),
        sigHashExpected,
        leafHash,
      ),
    );
  });
});
