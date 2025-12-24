import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hash160 } from '@scure/btc-signer/utils.js';
import { randomBytes } from 'crypto';
import { getScriptIntrospectionValues } from '../../../lib/liquid/Utils';
import {
  p2pkhOutput,
  p2shOutput,
  p2trOutput,
  p2wpkhOutput,
  p2wshOutput,
} from '../../../lib/swap/Scripts';

describe('Liquid Utils', () => {
  test('should get P2TR introspection values', () => {
    const output = p2trOutput(
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
    );

    expect(getScriptIntrospectionValues(Buffer.from(output))).toEqual({
      version: 1,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2WPKH introspection values', () => {
    const output = p2wpkhOutput(
      hash160(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey())),
    );

    expect(getScriptIntrospectionValues(Buffer.from(output))).toEqual({
      version: 0,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2WSH introspection values', () => {
    const output = p2wshOutput(sha256(randomBytes(32)));

    expect(getScriptIntrospectionValues(Buffer.from(output))).toEqual({
      version: 0,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2PKH introspection values', () => {
    const output = p2pkhOutput(
      hash160(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey())),
    );

    expect(getScriptIntrospectionValues(Buffer.from(output))).toEqual({
      version: -1,
      script: sha256(output),
    });
  });

  test('should get P2SH introspection values', () => {
    const output = p2shOutput(hash160(randomBytes(32)));

    expect(getScriptIntrospectionValues(Buffer.from(output))).toEqual({
      version: -1,
      script: sha256(output),
    });
  });
});
