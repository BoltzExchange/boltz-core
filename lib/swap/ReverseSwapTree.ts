import ops from '@boltz/bitcoin-ops';
import { crypto, script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { Taptree } from 'bitcoinjs-lib/src/types';
import { SwapTree } from '../consts/Types';
import { createLeaf } from './TaprootUtils';
import { createRefundLeaf } from './SwapTree';

const reverseSwapTree = (
  preimageHash: Buffer,
  claimPublicKey: Buffer,
  refundPublicKey: Buffer,
  timeoutBlockHeight: number,
): SwapTree => {
  const claimLeaf = createLeaf([
    ops.OP_SIZE,
    script.number.encode(32),
    ops.OP_EQUALVERIFY,
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

export default reverseSwapTree;
