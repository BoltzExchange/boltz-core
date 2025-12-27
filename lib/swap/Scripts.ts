import { sha256 } from '@noble/hashes/sha2.js';
import { Script } from '@scure/btc-signer';
import { hash160 } from '@scure/btc-signer/utils.js';
import { OutputType } from '../consts/Enums';
import { toXOnly } from './TaprootUtils';

export const p2trOutput = (publicKey: Uint8Array): Uint8Array => {
  return Script.encode(['OP_1', toXOnly(publicKey)]);
};

/**
 * Get a P2WPKH output script
 *
 * @param hash public key hash
 *
 * @returns P2WPKH output script
 */
export const p2wpkhOutput = (hash: Uint8Array): Uint8Array => {
  return Script.encode(['OP_0', hash]);
};

/**
 * Encode a P2WSH output script
 *
 * @param script redeem script
 *
 * @returns P2WSH output script
 */
export const p2wshOutput = (script: Uint8Array): Uint8Array => {
  return Script.encode(['OP_0', sha256(script)]);
};

/**
 * Get a P2PKH output script
 *
 * @param hash public key hash
 *
 * @returns P2PKH output script
 */
export const p2pkhOutput = (hash: Uint8Array): Uint8Array => {
  return Script.encode(['DUP', 'HASH160', hash, 'EQUALVERIFY', 'CHECKSIG']);
};

/**
 * Encode a P2SH output script
 *
 * @param script redeem script
 *
 * @returns P2SH output script
 */
export const p2shOutput = (script: Uint8Array): Uint8Array => {
  return Script.encode(['HASH160', hash160(script), 'EQUAL']);
};

/**
 * Get a P2SH nested P2WPKH output script
 *
 * @param hash public key hash
 */
export const p2shP2wpkhOutput = (
  hash: Uint8Array,
): { redeemScript: Uint8Array; outputScript: Uint8Array } => {
  const witness = p2wpkhOutput(hash);

  return {
    redeemScript: witness,
    outputScript: p2shOutput(witness),
  };
};

/**
 * Get a P2SH nested P2WSH output script
 *
 * @param script redeem script
 */
export const p2shP2wshOutput = (script: Uint8Array): Uint8Array => {
  const witness = p2wshOutput(script);

  return p2shOutput(witness);
};

export const outputFunctionForType = (
  type: OutputType,
): ((input: Uint8Array) => Uint8Array) => {
  switch (type) {
    case OutputType.Taproot:
      return p2trOutput;
    case OutputType.Bech32:
      return p2wshOutput;
    case OutputType.Compatibility:
      return p2shP2wshOutput;
    case OutputType.Legacy:
      return p2shOutput;
  }
};
