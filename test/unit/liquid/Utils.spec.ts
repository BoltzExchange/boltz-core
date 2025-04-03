import { crypto } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import { getScriptIntrospectionValues } from '../../../lib/liquid/Utils';
import {
  p2pkhOutput,
  p2shOutput,
  p2trOutput,
  p2wpkhOutput,
  p2wshOutput,
} from '../../../lib/swap/Scripts';
import { ECPair } from '../Utils';

describe('Liquid Utils', () => {
  test('should get P2TR introspection values', () => {
    const output = p2trOutput(Buffer.from(ECPair.makeRandom().publicKey));

    expect(getScriptIntrospectionValues(output)).toEqual({
      version: 1,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2WPKH introspection values', () => {
    const output = p2wpkhOutput(
      crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey)),
    );

    expect(getScriptIntrospectionValues(output)).toEqual({
      version: 0,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2WSH introspection values', () => {
    const output = p2wshOutput(crypto.sha256(randomBytes(32)));

    expect(getScriptIntrospectionValues(output)).toEqual({
      version: 0,
      script: output.subarray(2, 40),
    });
  });

  test('should get P2PKH introspection values', () => {
    const output = p2pkhOutput(
      crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey)),
    );

    expect(getScriptIntrospectionValues(output)).toEqual({
      version: -1,
      script: crypto.sha256(output),
    });
  });

  test('should get P2SH introspection values', () => {
    const output = p2shOutput(crypto.hash160(randomBytes(32)));

    expect(getScriptIntrospectionValues(output)).toEqual({
      version: -1,
      script: crypto.sha256(output),
    });
  });
});
