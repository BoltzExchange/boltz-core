import ops from '@boltz/bitcoin-ops';
import { crypto, script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import type { SwapTree } from '../consts/Types';
import {
  createRefundLeaf,
  extractRefundPublicKeyFromSwapTree,
} from './SwapTree';
import { createLeaf, swapLeafsToTree } from './TaprootUtils';

export const extractClaimPublicKeyFromReverseSwapTree = (
  swapTree: SwapTree,
): Buffer => script.decompile(swapTree.claimLeaf.output)![6] as Buffer;

export const extractRefundPublicKeyFromReverseSwapTree = (
  swapTree: SwapTree,
): Buffer => extractRefundPublicKeyFromSwapTree(swapTree);

const reverseSwapTree = (
  isLiquid: boolean,
  preimageHash: Buffer,
  claimPublicKey: Buffer,
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf(isLiquid, [
    ops.OP_SIZE,
    script.number.encode(32),
    ops.OP_EQUALVERIFY,
    ops.OP_HASH160,
    crypto.ripemd160(preimageHash),
    ops.OP_EQUALVERIFY,
    toXOnly(claimPublicKey),
    ops.OP_CHECKSIG,
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
