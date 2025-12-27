import { hex } from '@scure/base';
import type { TxOutput } from 'liquidjs-lib';
import { Transaction } from 'liquidjs-lib';
import type { HashTree } from 'liquidjs-lib/src/bip341';
import {
  findScriptPath as liquidFindScriptPath,
  tapLeafHash as liquidTapLeafHash,
} from 'liquidjs-lib/src/bip341';
import { taggedHash } from 'liquidjs-lib/src/crypto';
import type { Network } from 'liquidjs-lib/src/networks';
import type { TapLeaf, TapTree } from '../../consts/Types';
import Musig from '../../musig/Musig';
import { toXOnly } from '../../swap/TaprootUtils';
import { secp } from '../init';

const convertLeaf = (leaf: TapLeaf) => ({
  version: leaf.version,
  scriptHex: hex.encode(leaf.output),
});

export const hashForWitnessV1 = (
  network: Network,
  details: TxOutput[],
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

export const tapLeafHash = (leaf: TapLeaf) =>
  liquidTapLeafHash(convertLeaf(leaf));

export const tapBranchHash = (a: Buffer, b: Buffer) =>
  taggedHash('TapBranch/elements', Buffer.concat([a, b]));

export const tapTweakHash = (publicKey: Buffer, tweak: Buffer) =>
  taggedHash('TapTweak/elements', Buffer.concat([toXOnly(publicKey), tweak]));

export function toHashTree(scriptTree: TapTree): HashTree {
  if (!Array.isArray(scriptTree)) {
    return { hash: tapLeafHash(scriptTree) };
  }

  const hashes = [toHashTree(scriptTree[0]), toHashTree(scriptTree[1])];
  hashes.sort((a, b) => a.hash.compare(b.hash));
  const [left, right] = hashes;

  return {
    hash: tapBranchHash(left.hash, right.hash),
    left,
    right,
  };
}

export const tweakMusig = (musig: Musig, tree: TapTree): Musig => {
  const tweak = toHashTree(tree).hash;
  return Musig.tweak(musig, tapTweakHash(Buffer.from(musig.pubkeyAgg), tweak));
};

export const createControlBlock = (
  hashTree: HashTree,
  leaf: TapLeaf,
  internalKey: Buffer,
): Buffer => {
  const path = liquidFindScriptPath(hashTree, tapLeafHash(leaf));
  if (path === undefined || path.length === 0) {
    throw 'leaf not in tree';
  }

  const outputKey = secp.ecc.xOnlyPointAddTweak(
    internalKey,
    tapTweakHash(internalKey, hashTree.hash),
  );
  if (outputKey === null) {
    throw 'output key is null';
  }

  return Buffer.concat(
    [Buffer.from([leaf.version | outputKey.parity]), internalKey].concat(path),
  );
};
