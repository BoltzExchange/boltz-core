import { schnorr } from '@noble/curves/secp256k1';
import {
  Script,
  type ScriptType,
  TaprootControlBlock,
} from '@scure/btc-signer';
import {
  type HashedTree,
  type HashedTreeWithPath,
  TAP_LEAF_VERSION,
  type TaprootLeaf,
  tapLeafHash,
} from '@scure/btc-signer/payment.js';
import {
  compareBytes,
  equalBytes,
  taprootTweakPubkey,
} from '@scure/btc-signer/utils.js';
import type { TapLeaf, TapTree } from '../consts/Types';
import Musig from '../musig/Musig';

export const TAP_LEAF_VERSION_LIQUID = 196;

/**
 * Convert a public key to x-only format (32 bytes)
 * If the key is already 32 bytes, return as-is
 * If the key is 33 bytes, strip the first byte
 *
 * @param pubKey - The public key as Uint8Array
 * @returns The x-only public key (32 bytes)
 */
export const toXOnly = (pubKey: Uint8Array): Uint8Array => {
  return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
};

export const swapLeafsToTree = (
  claimLeaf: TapLeaf,
  refundLeaf: TapLeaf,
): TapTree => [claimLeaf, refundLeaf];

export const createControlBlock = (
  hashTree: HashedTree,
  leaf: TapLeaf,
  internalKey: Uint8Array,
): Uint8Array => {
  const paths = taprootAddPath(hashTree);
  const path = taprootWalkTree(paths).find((path) =>
    equalBytes(path.script, leaf.output),
  );
  if (path === undefined) {
    throw Error('leaf not in tree');
  }

  const parity = taprootTweakPubkey(internalKey, hashTree.hash)?.[1];

  return TaprootControlBlock.encode({
    version: leaf.version + parity,
    internalKey,
    merklePath: path.path,
  });
};

export const createLeaf = (isLiquid: boolean, script: ScriptType): TapLeaf => ({
  version: isLiquid ? TAP_LEAF_VERSION_LIQUID : TAP_LEAF_VERSION,
  output: Script.encode(script),
});

export const tweakMusig = (musig: Musig, tree: TapTree): Musig => {
  const tweak = taprootHashTree(tree).hash;
  return Musig.tweak(
    musig,
    schnorr.utils.taggedHash('TapTweak', musig.pubkeyAgg, tweak),
  );
};

export const taprootHashTree = (tree: TapTree): HashedTree => {
  if (!Array.isArray(tree)) {
    return {
      type: 'leaf',
      version: tree.version,
      script: tree.output,
      hash: tapLeafHash(tree.output, tree.version),
    };
  }

  const left = taprootHashTree(tree[0]);
  const right = taprootHashTree(tree[1]);
  let [lH, rH] = [left.hash, right.hash];
  if (compareBytes(rH, lH) === -1) [lH, rH] = [rH, lH];

  return {
    type: 'branch',
    left,
    right,
    hash: schnorr.utils.taggedHash('TapBranch', lH, rH),
  };
};

const taprootAddPath = (
  tree: HashedTree,
  path: Uint8Array[] = [],
): HashedTreeWithPath => {
  if (tree.type === 'leaf') {
    return { ...tree, path };
  }

  return {
    ...tree,
    path,
    left: taprootAddPath(tree.left, [tree.right.hash, ...path]),
    right: taprootAddPath(tree.right, [tree.left.hash, ...path]),
  };
};

const taprootWalkTree = (tree: HashedTreeWithPath): TaprootLeaf[] => {
  if (tree.type === 'leaf') {
    return [tree];
  }

  return [...taprootWalkTree(tree.left), ...taprootWalkTree(tree.right)];
};
