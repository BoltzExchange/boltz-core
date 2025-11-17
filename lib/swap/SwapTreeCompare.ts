import type { Taptree } from 'bitcoinjs-lib/src/types';
import type { SwapTree, Tapleaf } from '../consts/Types';

const compareLeaf = (leaf: Tapleaf, compareLeaf: Tapleaf) =>
  leaf.version === compareLeaf.version &&
  leaf.output.equals(compareLeaf.output);

const compareTree = (tree: Taptree, compare: Taptree) => {
  if (Array.isArray(tree) !== Array.isArray(compare)) {
    return false;
  }

  if (Array.isArray(tree) && Array.isArray(compare)) {
    return (
      tree.length === compare.length &&
      tree.every((leaf, i) => compareTree(leaf, compare[i]))
    );
  } else {
    return compareLeaf(tree as Tapleaf, compare as Tapleaf);
  }
};

export const compareTrees = <T extends SwapTree>(
  tree: T,
  compare: T,
): boolean => compareTree(tree.tree, compare.tree);
