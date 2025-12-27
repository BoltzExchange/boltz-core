import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { Script, Transaction } from '@scure/btc-signer';
import { hash160 } from '@scure/btc-signer/utils.js';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../lib/consts/Enums';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import {
  outputFunctionForType,
  p2pkhOutput,
  p2trOutput,
} from '../../../lib/swap/Scripts';
import { detectSwap } from '../../../lib/swap/SwapDetector';
import swapScript from '../../../lib/swap/SwapScript';
import { toXOnly } from '../../../lib/swap/TaprootUtils';

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
    const publicKey = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const redeemScript = scriptFunc(sha256(publicKey), publicKey, publicKey, 1);

    const expectedAmount = 42n;
    const script = outputFunctionForType(type)!(redeemScript);

    const transaction = new Transaction({
      allowUnknownOutputs: true,
    });
    transaction.addOutput({
      amount: 12n,
      script: p2pkhOutput(
        hash160(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey())),
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

    const output = detectSwap(redeemScript, transaction)!;

    expect(output).not.toBeUndefined();
    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(expectedAmount);
    expect(output.type).toEqual(type);
    expect(output.script).toEqual(script);
  });

  test('should detect tweaked Taproot keys', () => {
    const publicKey = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
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

    const output = detectSwap(tweakedKeys, transaction)!;

    expect(output).not.toBeUndefined();
    expect(output.vout).toEqual(1);
    expect(output.amount).toEqual(21n);
    expect(output.type).toEqual(OutputType.Taproot);
    expect(output.script).toEqual(p2trOutput(tweakedKeys));
  });

  test('should return undefined no swap can be found', () => {
    const publicKey = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
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

    const output = detectSwap(randomBytes(32), transaction);

    expect(output).toBeUndefined();
  });
});
