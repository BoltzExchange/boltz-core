import { Transaction, script as bitcoinScript, crypto } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { randomBytes } from 'crypto';
import { OutputType } from '../../../lib/consts/Enums';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import {
  outputFunctionForType,
  p2pkhOutput,
  p2trOutput,
} from '../../../lib/swap/Scripts';
import { detectSwap } from '../../../lib/swap/SwapDetector';
import swapScript from '../../../lib/swap/SwapScript';
import { ECPair } from '../Utils';

describe('SwapDetector', () => {
  test.each`
    type                        | scriptFunc           | name
    ${OutputType.Bech32}        | ${swapScript}        | ${'P2WSH swap'}
    ${OutputType.Compatibility} | ${swapScript}        | ${'P2SH nested P2WSH swap'}
    ${OutputType.Legacy}        | ${swapScript}        | ${'P2SH swap'}
    ${OutputType.Bech32}        | ${reverseSwapScript} | ${'P2WSH reverse swap'}
    ${OutputType.Compatibility} | ${reverseSwapScript} | ${'P2SH nested P2WSH reverse swap'}
    ${OutputType.Legacy}        | ${reverseSwapScript} | ${'P2SH reverse swap'}
  `('should detect $name', async ({ type, scriptFunc }) => {
    const publicKey = Buffer.from(ECPair.makeRandom().publicKey);
    const redeemScript = scriptFunc(
      crypto.sha256(publicKey),
      publicKey,
      publicKey,
      1,
    );

    const expectedAmount = 42;
    const script = outputFunctionForType(type)!(redeemScript);

    const transaction = new Transaction();
    transaction.addOutput(
      p2pkhOutput(crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey))),
      12,
    );
    transaction.addOutput(script, expectedAmount);
    transaction.addOutput(bitcoinScript.fromASM('OP_RETURN'), 312);

    const output = detectSwap(redeemScript, transaction);

    expect(output).not.toBeUndefined();
    expect(output!.vout).toEqual(1);
    expect(output!.value).toEqual(expectedAmount);
    expect(output!.type).toEqual(type);
    expect(output!.script).toEqual(script);
  });

  test('should detect tweaked Taproot keys', () => {
    const keys = ECPair.makeRandom();
    const tweakedKeys = toXOnly(Buffer.from(keys.publicKey));

    const transaction = new Transaction();
    transaction.addOutput(
      p2pkhOutput(crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey))),
      12,
    );
    transaction.addOutput(p2trOutput(tweakedKeys), 21);
    transaction.addOutput(bitcoinScript.fromASM('OP_RETURN'), 312);

    const output = detectSwap(tweakedKeys, transaction);

    expect(output).not.toBeUndefined();
    expect(output!.vout).toEqual(1);
    expect(output!.value).toEqual(21);
    expect(output!.type).toEqual(OutputType.Taproot);
    expect(output!.script).toEqual(p2trOutput(tweakedKeys));
  });

  test('should return undefined no swap can be found', () => {
    const transaction = new Transaction();
    transaction.addOutput(
      p2pkhOutput(crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey))),
      12,
    );
    transaction.addOutput(bitcoinScript.fromASM('OP_RETURN'), 312);

    const output = detectSwap(randomBytes(32), transaction);

    expect(output).toBeUndefined();
  });
});
