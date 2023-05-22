import { crypto } from 'bitcoinjs-lib';
import { ECPair } from './Utils';
import { getHexBuffer } from '../../../lib/Utils';
import swapScript from '../../../lib/swap/SwapScript';
import { OutputType } from '../../../lib/consts/Enums';
import { detectPreimage } from '../../../lib/swap/PreimageDetector';
import { constructClaimTransaction } from '../../../lib/swap/Claim';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import { outputFunctionForType, p2wpkhOutput } from '../../../lib/swap/Scripts';

describe('PreimageDetector', () => {
  const claimKeys = ECPair.makeRandom();
  const refundKeys = ECPair.makeRandom();

  const preimage = getHexBuffer(
    '7568110bcf788e974f918332f357dec2c33b2d76b2f61f9873afcb8f1598c91e',
  );

  test.each`
    type                        | scriptFunc           | name
    ${OutputType.Bech32}        | ${swapScript}        | ${'P2WSH swap'}
    ${OutputType.Compatibility} | ${swapScript}        | ${'P2SH nested P2WSH swap'}
    ${OutputType.Legacy}        | ${swapScript}        | ${'P2SH swap'}
    ${OutputType.Bech32}        | ${reverseSwapScript} | ${'P2WSH reverse swap'}
    ${OutputType.Compatibility} | ${reverseSwapScript} | ${'P2SH nested P2WSH reverse swap'}
    ${OutputType.Legacy}        | ${reverseSwapScript} | ${'P2SH reverse swap'}
  `(`should detect preimage of $name input`, async ({ type, scriptFunc }) => {
    const redeemScript = scriptFunc(
      crypto.hash160(preimage),
      claimKeys.publicKey,
      refundKeys.publicKey,
      1,
    );
    const claimTransaction = constructClaimTransaction(
      [
        {
          preimage,
          redeemScript,
          type: type,
          keys: claimKeys,
          vout: 0,
          value: 123123,
          script: outputFunctionForType(type)!(redeemScript),
          txHash: getHexBuffer(
            '287d2e3a5726710c2b6c94084c28789b250d703feb1e10012921cc2d4ab7f277',
          ),
        },
      ],
      p2wpkhOutput(crypto.hash160(claimKeys.publicKey)),
      2,
      false,
    );

    const foundPreimage = detectPreimage(0, claimTransaction);
    expect(foundPreimage).toEqual(preimage);
  });
});
