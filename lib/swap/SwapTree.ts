import { ripemd160 } from '@noble/hashes/legacy.js';
import { Script } from '@scure/btc-signer';
import type { SwapTree } from '../consts/Types';
import { createLeaf, swapLeafsToTree, toXOnly } from './TaprootUtils';

export const createRefundLeaf = (
  isLiquid: boolean,
  refundPublicKey: Uint8Array,
  timeoutBlockHeight: number,
) =>
  createLeaf(isLiquid, [
    toXOnly(refundPublicKey),
    'CHECKSIGVERIFY',
    timeoutBlockHeight,
    'CHECKLOCKTIMEVERIFY',
  ]);

export const extractClaimPublicKeyFromSwapTree = (
  swapTree: SwapTree,
): Uint8Array => Script.decode(swapTree.claimLeaf.output)![3] as Uint8Array;

export const extractRefundPublicKeyFromSwapTree = (
  swapTree: SwapTree,
): Uint8Array => Script.decode(swapTree.refundLeaf.output)![0] as Uint8Array;

const swapTree = (
  isLiquid: boolean,
  preimageHash: Uint8Array,
  claimPublicKey: Uint8Array,
  refundPublicKey: Uint8Array,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf(isLiquid, [
    'HASH160',
    ripemd160(preimageHash),
    'EQUALVERIFY',
    toXOnly(claimPublicKey),
    'CHECKSIG',
  ]);
  const refundLeaf = createRefundLeaf(
    isLiquid,
    refundPublicKey,
    timeoutBlockHeight,
  );

  return {
    claimLeaf,
    refundLeaf,
    tree: swapLeafsToTree(claimLeaf, refundLeaf),
  };
};

export default swapTree;
