import type { LiquidSwapTree } from '../consts/Types';

type ProbabilityNode<T> = { probability: number; value: T };

type TreeNode<T> = Tree<T> | T;
type Tree<T> = [TreeNode<T>, TreeNode<T>];

const subSortTree = <T>(nodes: ProbabilityNode<T>[]): TreeNode<T> => {
  if (nodes.length === 1) {
    return nodes[0].value;
  } else if (nodes.length === 2) {
    return [nodes[0].value, nodes[1].value];
  }

  const sum = nodes.reduce((sum, node) => sum + node.probability, 0);

  let mid = 0;
  let midSum = 0;

  while (midSum < sum / 2) {
    midSum += nodes[mid].probability;
    mid++;
  }

  return [subSortTree(nodes.slice(0, mid)), subSortTree(nodes.slice(mid))];
};

export const sortTree = <T>(nodes: ProbabilityNode<T>[]): TreeNode<T> =>
  subSortTree(nodes.sort((a, b) => b.probability - a.probability));

export const assignTreeProbabilities = <T>(
  tree: Omit<
    Record<keyof Omit<LiquidSwapTree, 'covenantClaimLeaf'>, T | undefined> & {
      covenantClaimLeaf?: T;
    },
    'tree'
  >,
): ProbabilityNode<T>[] => {
  if (tree.claimLeaf === undefined || tree.refundLeaf === undefined) {
    throw 'invalid tree';
  }

  if (tree.covenantClaimLeaf) {
    return [
      {
        probability: 51,
        value: tree.covenantClaimLeaf,
      },
      {
        probability: 25,
        value: tree.claimLeaf,
      },
      {
        probability: 24,
        value: tree.refundLeaf,
      },
    ];
  }

  return [
    {
      probability: 51,
      value: tree.claimLeaf,
    },
    {
      probability: 49,
      value: tree.refundLeaf,
    },
  ];
};

export { Tree, TreeNode, ProbabilityNode };
