import { equalBytes } from '@scure/btc-signer/utils.js';
import type { SwapTree, TapLeaf, TapTree } from '../consts/Types';

const compareLeaf = (leaf: TapLeaf, compareLeaf: TapLeaf) =>
  leaf.version === compareLeaf.version &&
  equalBytes(leaf.output, compareLeaf.output);

const compareTree = (tree: TapTree, compare: TapTree) => {
  if (Array.isArray(tree) !== Array.isArray(compare)) {
    return false;
  }

  if (Array.isArray(tree) && Array.isArray(compare)) {
    return (
      tree.length === compare.length &&
      tree.every((leaf, i) => compareTree(leaf, compare[i]))
    );
  } else {
    return compareLeaf(tree as TapLeaf, compare as TapLeaf);
  }
};

export const compareTrees = <T extends SwapTree>(
  tree: T,
  compare: T,
): boolean => compareTree(tree.tree, compare.tree);
