import { expect } from 'chai';
import { Transaction, ECPair, crypto } from 'bitcoinjs-lib';
import { OutputType } from '../../../lib/consts/Enums';
import { swapScript } from '../../../lib/swap/SwapScript';
import { detectSwap } from '../../../lib/swap/SwapDetector';
import { p2wshOutput, p2shOutput, p2shP2wshOutput } from '../../../lib/swap/Scripts';

describe('SwapDetector', () => {
  let redeemScript: Buffer;

  const scripts: Buffer[] = [];
  const transactions: Transaction[] = [];

  const getScriptHashFunction = (type: OutputType) => {
    switch (type) {
      case OutputType.Bech32: return p2wshOutput;
      case OutputType.Legacy: return p2shOutput;
      case OutputType.Compatibility: return p2shP2wshOutput;
    }
  };

  const verifyDetectSwap = (index: number) => {
    const output = detectSwap(redeemScript, transactions[index]);

    expect(output).to.not.be.undefined;

    expect(output!.vout).to.be.equal(0);
    expect(output!.value).to.be.equal(1);
    expect(output!.type).to.be.equal(index);
    expect(output!.script).to.be.deep.equal(scripts[index]);
  };

  before(() => {
    const keys = ECPair.makeRandom();

    // Since we don't want to claim or refund the swap we can use random arguments
    redeemScript = swapScript(
      crypto.sha256(keys.publicKey),
      keys.publicKey,
      keys.publicKey,
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

  it('should detect P2WSH swaps', () => {
    verifyDetectSwap(0);
  });

  it('should detect P2SH swaps', () => {
    verifyDetectSwap(1);
  });

  it('should detect P2SH nested P2WSH swaps', () => {
    verifyDetectSwap(2);
  });
});
