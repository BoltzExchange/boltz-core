import { Transaction, ECPair, crypto } from 'bitcoinjs-lib';
import { getScriptHashFunction } from './Utils';
import { getHexBuffer } from '../../../lib/Utils';
import swapScript from '../../../lib/swap/SwapScript';
import { OutputType } from '../../../lib/consts/Enums';
import { p2wpkhOutput } from '../../../lib/swap/Scripts';
import { detectPreimage } from '../../../lib/swap/PreimageDetector';
import { constructClaimTransaction } from '../../../lib/swap/Claim';

describe('Preimagedetector', () => {
  const claimKeys = ECPair.makeRandom();
  const refundKeys = ECPair.makeRandom();

  const preimage = getHexBuffer('7568110bcf788e974f918332f357dec2c33b2d76b2f61f9873afcb8f1598c91e');

  const claimTransactions: Transaction[] = [];

  const verifyDetectPreimage = (type: number) => {
    const foundPreimage = detectPreimage(0, claimTransactions[type]);

    expect(foundPreimage).toEqual(preimage);
  };

  beforeAll(() => {
    const redeemScript = swapScript(
      crypto.hash160(preimage),
      claimKeys.publicKey,
      refundKeys.publicKey,
      1,
    );

    for (let i = 0; i < 3; i += 1) {
      const scriptHashFunction = getScriptHashFunction(i);

      const claimTransaction = constructClaimTransaction(
        [{
          preimage,
          redeemScript,
          type: i,
          keys: claimKeys,
          vout: 0,
          value: 123123,
          script: scriptHashFunction(redeemScript),
          txHash: getHexBuffer('287d2e3a5726710c2b6c94084c28789b250d703feb1e10012921cc2d4ab7f277'),
        }],
        p2wpkhOutput(crypto.hash160(claimKeys.publicKey)),
        2,
        false,
      );

      claimTransactions.push(claimTransaction);
    }
  });

  test('should detect preimage of P2WSH swap inputs', () => {
    verifyDetectPreimage(OutputType.Bech32);
  });

  test('should detect preimage of P2SH-P2WSH swap inputs', () => {
    verifyDetectPreimage(OutputType.Compatibility);
  });

  test('should detect preimage of P2SH swap inputs', () => {
    verifyDetectPreimage(OutputType.Legacy);
  });
});
