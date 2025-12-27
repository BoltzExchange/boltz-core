import { hex } from '@scure/base';
import type { LiquidSwapTree, SwapTree, TapLeaf } from '../consts/Types';
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

const serializeLeaf = (leaf: TapLeaf): SerializedLeaf => ({
  version: leaf.version,
  output: hex.encode(leaf.output),
});

const deserializeLeaf = (leaf: SerializedLeaf): TapLeaf => ({
  version: leaf.version,
  output: hex.decode(leaf.output),
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

export type { SerializedLeaf, SerializedTree };
