/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import ops from '@boltz/bitcoin-ops';
import { crypto } from 'bitcoinjs-lib';
import { toPushdataScript, encodeCltv } from './SwapUtils';

/**
 * Generate a swap redeem script
 *
 * @param preimageHash hash of the preimage of the swap
 * @param claimPublicKey public key of the keypair needed for claiming
 * @param refundPublicKey public key of the keypair needed for refunding
 * @param timeoutBlockHeight at what block the HTLC should time out
 *
 * @returns redeem script
 */
const swapScript = (preimageHash: Buffer, claimPublicKey: Buffer, refundPublicKey: Buffer, timeoutBlockHeight: number): Buffer => {
  const cltv = encodeCltv(timeoutBlockHeight);

  return toPushdataScript([
    ops.OP_HASH160,
    crypto.ripemd160(preimageHash),
    ops.OP_EQUAL,

    ops.OP_IF,
    claimPublicKey,

    ops.OP_ELSE,
    cltv,
    ops.OP_CHECKLOCKTIMEVERIFY,
    ops.OP_DROP,
    refundPublicKey,

    ops.OP_ENDIF,

    ops.OP_CHECKSIG,
  ]);
};

export default swapScript;
