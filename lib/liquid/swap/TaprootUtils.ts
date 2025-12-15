import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import type { Taptree } from 'bitcoinjs-lib/src/types';
import { isTapleaf } from 'bitcoinjs-lib/src/types';
import type { TxOutput } from 'liquidjs-lib';
import { Transaction } from 'liquidjs-lib';
import type { HashTree } from 'liquidjs-lib/src/bip341';
import {
  findScriptPath as liquidFindScriptPath,
  tapLeafHash as liquidTapLeafHash,
} from 'liquidjs-lib/src/bip341';
import { taggedHash } from 'liquidjs-lib/src/crypto';
import type { Network } from 'liquidjs-lib/src/networks';
import { getHexString } from '../../Utils';
import type { Tapleaf } from '../../consts/Types';
import Musig from '../../musig/Musig';
import { secp } from '../init';

const convertLeaf = (leaf: Tapleaf) => ({
  version: leaf.version,
  scriptHex: getHexString(leaf.output),
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

export const tapLeafHash = (leaf: Tapleaf) =>
  liquidTapLeafHash(convertLeaf(leaf));

export const tapBranchHash = (a: Buffer, b: Buffer) =>
  taggedHash('TapBranch/elements', Buffer.concat([a, b]));

export const tapTweakHash = (publicKey: Buffer, tweak: Buffer) =>
  taggedHash('TapTweak/elements', Buffer.concat([toXOnly(publicKey), tweak]));

export function toHashTree(scriptTree: Taptree): HashTree {
  if (isTapleaf(scriptTree)) {
    return { hash: tapLeafHash(scriptTree as Tapleaf) };
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

export const tweakMusig = (musig: Musig, tree: Taptree): Musig => {
  const tweak = toHashTree(tree).hash;
  return Musig.tweak(musig, tapTweakHash(Buffer.from(musig.pubkeyAgg), tweak));
};

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
