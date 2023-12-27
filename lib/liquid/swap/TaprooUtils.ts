import { Transaction } from 'liquidjs-lib';
import { Network } from 'liquidjs-lib/src/networks';
import { taggedHash } from 'liquidjs-lib/src/crypto';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { isTapleaf, Taptree } from 'bitcoinjs-lib/src/types';
import {
  HashTree,
  TaprootLeaf,
  toHashTree as liquidToHashTree,
  tapLeafHash as liquidTapLeafHash,
  findScriptPath as liquidFindScriptPath,
} from 'liquidjs-lib/src/bip341';
import { secp } from '../init';
import Musig from '../../musig/Musig';
import { getHexString } from '../../Utils';
import { Tapleaf } from '../../consts/Types';
import { LiquidRefundDetails } from '../consts/Types';

const convertLeaf = (leaf: Tapleaf) => ({
  version: leaf.version,
  scriptHex: getHexString(leaf.output),
});

export const hashForWitnessV1 = (
  network: Network,
  details: LiquidRefundDetails[],
  tx: Transaction,
  index: number,
  leafHash?: Buffer,
  hashType: number = Transaction.SIGHASH_DEFAULT,
): Buffer => {
  return tx.hashForWitnessV1(
    index,
    details.map((out) => out.script),
    details.map((out) => ({
      value: out.value,
      asset: out.asset,
    })),
    hashType,
    network.genesisBlockHash,
    leafHash,
  );
};

export const tapLeafHash = (leaf: Tapleaf) =>
  liquidTapLeafHash(convertLeaf(leaf));

export const tapTweakHash = (publicKey: Buffer, tweak: Buffer) =>
  taggedHash('TapTweak/elements', Buffer.concat([toXOnly(publicKey), tweak]));

export const toHashTree = (tree: Taptree): HashTree => {
  const leafs: TaprootLeaf[] = [];

  const convertToLeafs = (tree: Taptree) => {
    if (isTapleaf(tree)) {
      leafs.push(convertLeaf(tree as Tapleaf));
    } else {
      convertToLeafs(tree[0]);
      convertToLeafs(tree[1]);
    }
  };
  convertToLeafs(tree);

  return liquidToHashTree(leafs);
};

export const tweakMusig = (musig: Musig, tree: Taptree): Buffer =>
  toXOnly(
    musig.tweakKey(
      tapTweakHash(musig.getAggregatedPublicKey(), toHashTree(tree).hash),
    ),
  );

export const createControlBlock = (
  hashTree: HashTree,
  leaf: Tapleaf,
  internalKey: Buffer,
): Buffer => {
  const path = liquidFindScriptPath(hashTree, tapLeafHash(leaf));
  if (path === undefined || path.length === 0) {
    throw 'leaf not in tree';
  }

  const outputKey = secp.ecc.xOnlyPointAddTweak(
    internalKey,
    tapTweakHash(internalKey, hashTree.hash),
  )!;

  return Buffer.concat(
    [Buffer.from([leaf.version | outputKey.parity]), internalKey].concat(path),
  );
};
