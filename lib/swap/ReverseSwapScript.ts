/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import ops from '@boltz/bitcoin-ops';
import { script, crypto } from 'bitcoinjs-lib';
import { toPushdataScript, encodeCltv } from './SwapUtils';

/**
 * Generate a reverse swap redeem script
 *
 * @param preimageHash hash of the preimage of the swap
 * @param claimPublicKey public key of the keypair needed for claiming
 * @param refundPublicKey public key of the keypair needed for refunding
 * @param timeoutBlockHeight at what block the HTLC should time out
 *
 * @returns redeem script
 */
const reverseSwapScript = (preimageHash: Buffer, claimPublicKey: Buffer, refundPublicKey: Buffer, timeoutBlockHeight: number) => {
  const cltv = encodeCltv(timeoutBlockHeight);

  return toPushdataScript([
    ops.OP_SIZE,
    script.number.encode(32),
    ops.OP_EQUAL,

    ops.OP_IF,
    ops.OP_HASH160,
    crypto.ripemd160(preimageHash),
    ops.OP_EQUALVERIFY,
    claimPublicKey,
    ops.OP_ELSE,

    ops.OP_DROP,

    cltv,
    ops.OP_CHECKLOCKTIMEVERIFY,
    ops.OP_DROP,

    refundPublicKey,
    ops.OP_ENDIF,

    ops.OP_CHECKSIG,
  ]);
};

export default reverseSwapScript;
