import ops from '@boltz/bitcoin-ops';
import { crypto, script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import type { SwapTree } from '../consts/Types';
import { encodeCltv } from './SwapUtils';
import { createLeaf, swapLeafsToTree } from './TaprootUtils';

export const createRefundLeaf = (
  isLiquid: boolean,
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
) =>
  createLeaf(isLiquid, [
    toXOnly(refundPublicKey),
    ops.OP_CHECKSIGVERIFY,
    encodeCltv(timeoutBlockHeight),
    ops.OP_CHECKLOCKTIMEVERIFY,
  ]);

export const extractClaimPublicKeyFromSwapTree = (swapTree: SwapTree): Buffer =>
  script.decompile(swapTree.claimLeaf.output)![3] as Buffer;

export const extractRefundPublicKeyFromSwapTree = (
  swapTree: SwapTree,
): Buffer => script.decompile(swapTree.refundLeaf.output)![0] as Buffer;

const swapTree = (
  isLiquid: boolean,
  preimageHash: Buffer,
  claimPublicKey: Buffer,
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf(isLiquid, [
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

export default swapTree;
