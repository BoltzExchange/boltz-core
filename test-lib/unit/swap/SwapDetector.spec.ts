import { Transaction, ECPair, crypto } from 'bitcoinjs-lib';
import { getScriptHashFunction } from './Utils';
import swapScript from '../../../lib/swap/SwapScript';
import { detectSwap } from '../../../lib/swap/SwapDetector';

describe('SwapDetector', () => {
  let redeemScript: Buffer;

  const scripts: Buffer[] = [];
  const transactions: Transaction[] = [];

  const verifyDetectSwap = (index: number) => {
    const output = detectSwap(redeemScript, transactions[index]);

    expect(output).not.toBeUndefined();

    expect(output!.vout).toEqual(0);
    expect(output!.value).toEqual(1);
    expect(output!.type).toEqual(index);
    expect(output!.script).toEqual(scripts[index]);
  };

  beforeAll(() => {
    const keys = ECPair.makeRandom();

    // Since we don't want to claim or refund the swap we can use random arguments
    redeemScript = swapScript(
      crypto.sha256(keys.publicKey!),
      keys.publicKey!,
      keys.publicKey!,
      1,
    );

    for (let i = 0; i < 3; i += 1) {
      const transaction = new Transaction();

      const scriptHashFunction = getScriptHashFunction(i);
      const script = scriptHashFunction(redeemScript);

      scripts.push(script);
      transaction.addOutput(script, 1);

      transactions.push(transaction);
    }
  });

  test('should detect P2WSH swaps', () => {
    verifyDetectSwap(0);
  });

  test('should detect P2SH swaps', () => {
    verifyDetectSwap(1);
  });

  test('should detect P2SH nested P2WSH swaps', () => {
    verifyDetectSwap(2);
  });
});
