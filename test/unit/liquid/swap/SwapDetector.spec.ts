import { script as bitcoinScript, crypto } from 'bitcoinjs-lib';
import { Transaction, confidential } from 'liquidjs-lib';
import { OutputType } from '../../../../lib/consts/Enums';
import reverseSwapScript from '../../../../lib/swap/ReverseSwapScript';
import {
  outputFunctionForType,
  p2pkhOutput,
} from '../../../../lib/swap/Scripts';
import { detectSwap } from '../../../../lib/swap/SwapDetector';
import swapScript from '../../../../lib/swap/SwapScript';
import { ECPair } from '../../Utils';
import { lbtcRegtest, nonce } from './ClaimDetails';

describe('Liquid SwapDetector', () => {
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

    const transaction = new Transaction();
    const script = outputFunctionForType(type)!(redeemScript);
    transaction.addOutput(
      p2pkhOutput(crypto.hash160(Buffer.from(ECPair.makeRandom().publicKey))),
      confidential.satoshiToConfidentialValue(12),
      lbtcRegtest,
      nonce,
    );
    transaction.addOutput(
      script,
      confidential.satoshiToConfidentialValue(expectedAmount),
      lbtcRegtest,
      nonce,
    );
    transaction.addOutput(
      bitcoinScript.fromASM('OP_RETURN'),
      confidential.satoshiToConfidentialValue(312),
      lbtcRegtest,
      nonce,
    );

    const output = detectSwap(redeemScript, transaction)!;

    expect(output).not.toBeUndefined();
    expect(output.vout).toEqual(1);
    expect(output.type).toEqual(type);
    expect(output.nonce).toEqual(nonce);
    expect(output.script).toEqual(script);
    expect(output.asset).toEqual(lbtcRegtest);
    expect(output.rangeProof).toHaveLength(0);
    expect(output.surjectionProof).toHaveLength(0);
    expect(confidential.confidentialValueToSatoshi(output!.value)).toEqual(
      expectedAmount,
    );
  });
});
