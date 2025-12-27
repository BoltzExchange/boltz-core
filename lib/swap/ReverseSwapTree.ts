import { ripemd160 } from '@noble/hashes/legacy.js';
import { Script } from '@scure/btc-signer';
import type { SwapTree } from '../consts/Types';
import {
  createRefundLeaf,
  extractRefundPublicKeyFromSwapTree,
} from './SwapTree';
import { createLeaf, swapLeafsToTree, toXOnly } from './TaprootUtils';

export const extractClaimPublicKeyFromReverseSwapTree = (
  swapTree: SwapTree,
): Uint8Array => {
  const pubkey = Script.decode(swapTree.claimLeaf.output)?.[6];
  if (pubkey === undefined || !(pubkey instanceof Uint8Array)) {
    throw new Error('invalid claim public key');
  }
  return pubkey;
};

export const extractRefundPublicKeyFromReverseSwapTree = (
  swapTree: SwapTree,
): Uint8Array => extractRefundPublicKeyFromSwapTree(swapTree);

const reverseSwapTree = (
  isLiquid: boolean,
  preimageHash: Uint8Array,
  claimPublicKey: Uint8Array,
  refundPublicKey: Uint8Array,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf(isLiquid, [
    'SIZE',
    32,
    'EQUALVERIFY',
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

export default reverseSwapTree;
