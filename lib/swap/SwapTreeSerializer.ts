import { swapLeafsToTree } from './TaprootUtils';
import { SwapTree, Tapleaf } from '../consts/Types';
import { getHexBuffer, getHexString } from '../Utils';

type SerializedLeaf = {
  version: number;
  output: string;
};

const serializeLeaf = (leaf: Tapleaf): SerializedLeaf => ({
  version: leaf.version,
  output: getHexString(leaf.output),
});

const deserializeLeaf = (leaf: SerializedLeaf): Tapleaf => ({
  version: leaf.version,
  output: getHexBuffer(leaf.output),
});

export const serializeSwapTree = (tree: SwapTree): string =>
  JSON.stringify({
    claimLeaf: serializeLeaf(tree.claimLeaf),
    refundLeaf: serializeLeaf(tree.refundLeaf),
  });

export const deserializeSwapTree = (tree: string): SwapTree => {
  const parsed = JSON.parse(tree);

  const res = {
    claimLeaf: deserializeLeaf(parsed.claimLeaf),
    refundLeaf: deserializeLeaf(parsed.refundLeaf),
  };

  return {
    ...res,
    tree: swapLeafsToTree(res.claimLeaf, res.refundLeaf),
  };
};
