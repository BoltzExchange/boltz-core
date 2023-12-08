import ops from '@boltz/bitcoin-ops';
import { crypto } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { encodeCltv } from './SwapUtils';
import { SwapTree } from '../consts/Types';
import { createLeaf } from './TaprootUtils';

const createRefundLeaf = (
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
) =>
  createLeaf([
    toXOnly(refundPublicKey),
    ops.OP_CHECKSIGVERIFY,
    encodeCltv(timeoutBlockHeight),
    ops.OP_CHECKLOCKTIMEVERIFY,
  ]);

const swapTree = (
  preimageHash: Buffer,
  claimPublicKey: Buffer,
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf([
    ops.OP_HASH160,
    crypto.ripemd160(preimageHash),
    ops.OP_EQUALVERIFY,
    toXOnly(claimPublicKey),
    ops.OP_CHECKSIG,
  ]);
  const refundLeaf = createRefundLeaf(refundPublicKey, timeoutBlockHeight);

  const tree: Taptree = [claimLeaf, refundLeaf];

  return {
    tree,
    claimLeaf,
    refundLeaf,
  };
};

export default swapTree;
export { createRefundLeaf };
