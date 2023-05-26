import { crypto, script as bitcoinScript, Transaction } from 'bitcoinjs-lib';
import { ECPair } from './Utils';
import swapScript from '../../../lib/swap/SwapScript';
import { OutputType } from '../../../lib/consts/Enums';
import { detectSwap } from '../../../lib/swap/SwapDetector';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import { outputFunctionForType, p2pkhOutput } from '../../../lib/swap/Scripts';

describe('SwapDetector', () => {
  test.each`
    type                        | scriptFunc           | name
    ${OutputType.Bech32}        | ${swapScript}        | ${'P2WSH swap'}
    ${OutputType.Compatibility} | ${swapScript}        | ${'P2SH nested P2WSH swap'}
    ${OutputType.Legacy}        | ${swapScript}        | ${'P2SH swap'}
    ${OutputType.Bech32}        | ${reverseSwapScript} | ${'P2WSH reverse swap'}
    ${OutputType.Compatibility} | ${reverseSwapScript} | ${'P2SH nested P2WSH reverse swap'}
    ${OutputType.Legacy}        | ${reverseSwapScript} | ${'P2SH reverse swap'}
  `(`should detect $name`, async ({ type, scriptFunc }) => {
    const keys = ECPair.makeRandom();
    const redeemScript = scriptFunc(
      crypto.sha256(keys.publicKey!),
      keys.publicKey!,
      keys.publicKey!,
      1,
    );

    const expectedAmount = 42;

    const transaction = new Transaction();
    const script = outputFunctionForType(type)!(redeemScript);
    transaction.addOutput(
      p2pkhOutput(crypto.hash160(ECPair.makeRandom().publicKey!)),
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
});
