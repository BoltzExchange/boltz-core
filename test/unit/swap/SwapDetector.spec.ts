import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Script, Transaction } from '@scure/btc-signer';
import { hash160 } from '@scure/btc-signer/utils.js';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../lib/consts/Enums.ts';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript.ts';
import {
  outputFunctionForType,
  p2pkhOutput,
  p2trOutput,
} from '../../../lib/swap/Scripts.ts';
import { detectSwap } from '../../../lib/swap/SwapDetector.ts';
import swapScript from '../../../lib/swap/SwapScript.ts';
import { toXOnly } from '../../../lib/swap/TaprootUtils.ts';

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
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const redeemScript = scriptFunc(sha256(publicKey), publicKey, publicKey, 1);

    const expectedAmount = 42n;
    const script = outputFunctionForType(type)!(redeemScript);

    const transaction = new Transaction({
      allowUnknownOutputs: true,
    });
    transaction.addOutput({
      amount: 12n,
      script: p2pkhOutput(
        hash160(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey())),
      ),
    });
    transaction.addOutput({
      amount: expectedAmount,
      script: script,
    });
    transaction.addOutput({
      amount: 312n,
      script: Script.encode(['RETURN']),
    });

    const output = detectSwap(redeemScript, transaction, type)!;

    expect(output).not.toBeUndefined();
    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(expectedAmount);
    expect(output.type).toEqual(type);
    expect(output.script).toEqual(script);
  });

  test('should detect tweaked Taproot keys', () => {
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const tweakedKeys = toXOnly(publicKey);

    const transaction = new Transaction({
      allowUnknownOutputs: true,
    });
    transaction.addOutput({
      script: p2pkhOutput(hash160(publicKey)),
      amount: 12n,
    });
    transaction.addOutput({
      script: p2trOutput(tweakedKeys),
      amount: 21n,
    });
    transaction.addOutput({
      script: Script.encode(['RETURN']),
      amount: 312n,
    });

    const output = detectSwap(tweakedKeys, transaction, OutputType.Taproot)!;

    expect(output).not.toBeUndefined();
    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(21n);
    expect(output.type).toEqual(OutputType.Taproot);
    expect(output.script).toEqual(p2trOutput(tweakedKeys));
  });

  test('should restrict detection to an expected OutputType', () => {
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const redeemScript = swapScript(sha256(publicKey), publicKey, publicKey, 1);

    // A decoy output paying to the same redeem script under a different wrapper
    const decoy = outputFunctionForType(OutputType.Bech32)!(redeemScript);
    const advertised = outputFunctionForType(OutputType.Compatibility)!(
      redeemScript,
    );

    const transaction = new Transaction({ allowUnknownOutputs: true });
    transaction.addOutput({ amount: 42n, script: decoy });
    transaction.addOutput({ amount: 21n, script: advertised });

    // The decoy wrapper at vout 0 is ignored; only the advertised one is detected
    const output = detectSwap(
      redeemScript,
      transaction,
      OutputType.Compatibility,
    )!;

    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(21n);
    expect(output.type).toEqual(OutputType.Compatibility);
    expect(output.script).toEqual(advertised);
  });

  test('should restrict detection to an expected output script', () => {
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const redeemScript = swapScript(sha256(publicKey), publicKey, publicKey, 1);

    const decoy = outputFunctionForType(OutputType.Bech32)!(redeemScript);
    const advertised = outputFunctionForType(OutputType.Compatibility)!(
      redeemScript,
    );

    const transaction = new Transaction({ allowUnknownOutputs: true });
    transaction.addOutput({ amount: 42n, script: decoy });
    transaction.addOutput({ amount: 21n, script: advertised });

    const output = detectSwap(redeemScript, transaction, advertised)!;

    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(21n);
    expect(output.type).toEqual(OutputType.Compatibility);
    expect(output.script).toEqual(advertised);
  });

  test('should return undefined when no output matches the expectation', () => {
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const redeemScript = swapScript(sha256(publicKey), publicKey, publicKey, 1);

    const transaction = new Transaction({ allowUnknownOutputs: true });
    transaction.addOutput({
      amount: 42n,
      script: outputFunctionForType(OutputType.Bech32)!(redeemScript),
    });

    // The advertised wrapper is not present in the transaction
    expect(
      detectSwap(redeemScript, transaction, OutputType.Taproot),
    ).toBeUndefined();

    // An expected script that is not a valid wrapper of the key is rejected
    expect(
      detectSwap(redeemScript, transaction, randomBytes(34)),
    ).toBeUndefined();
  });

  test('should return undefined no swap can be found', () => {
    const publicKey = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey());
    const transaction = new Transaction({
      allowUnknownOutputs: true,
    });
    transaction.addOutput({
      script: p2pkhOutput(hash160(publicKey)),
      amount: 12n,
    });
    transaction.addOutput({
      script: Script.encode(['RETURN']),
      amount: 312n,
    });

    const output = detectSwap(randomBytes(32), transaction, OutputType.Bech32);

    expect(output).toBeUndefined();
  });
});
