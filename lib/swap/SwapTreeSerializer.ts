import { getHexBuffer, getHexString } from '../Utils';
import type { LiquidSwapTree, SwapTree, Tapleaf } from '../consts/Types';
import { assignTreeProbabilities, sortTree } from './TreeSort';

type SerializedLeaf = {
  version: number;
  output: string;
};

type SerializedTree = {
  claimLeaf: SerializedLeaf;
  refundLeaf: SerializedLeaf;
};

type SerializedLiquidSwapTree = SerializedTree & {
  covenantClaimLeaf?: SerializedLeaf;
};

const serializeLeaf = (leaf: Tapleaf): SerializedLeaf => ({
  version: leaf.version,
  output: getHexString(leaf.output),
});

const deserializeLeaf = (leaf: SerializedLeaf): Tapleaf => ({
  version: leaf.version,
  output: getHexBuffer(leaf.output),
});

export const serializeSwapTree = (
  tree: LiquidSwapTree,
): SerializedTree | SerializedLiquidSwapTree => {
  const res: SerializedLiquidSwapTree = {
    claimLeaf: serializeLeaf(tree.claimLeaf),
    refundLeaf: serializeLeaf(tree.refundLeaf),
  };

  if (tree.covenantClaimLeaf !== undefined) {
    res.covenantClaimLeaf = serializeLeaf(tree.covenantClaimLeaf);
  }

  return res;
};

export const deserializeSwapTree = (
  tree: string | SerializedTree | LiquidSwapTree,
): SwapTree | LiquidSwapTree => {
  const parsed = typeof tree === 'string' ? JSON.parse(tree) : tree;

  const res: Omit<LiquidSwapTree, 'tree'> = {
    claimLeaf: deserializeLeaf(parsed.claimLeaf),
    refundLeaf: deserializeLeaf(parsed.refundLeaf),
    covenantClaimLeaf:
      parsed.covenantClaimLeaf !== undefined
        ? deserializeLeaf(parsed.covenantClaimLeaf)
        : undefined,
  };

  return {
    ...res,
    tree: sortTree(assignTreeProbabilities(res)),
  };
};

export { SerializedLeaf, SerializedTree };
