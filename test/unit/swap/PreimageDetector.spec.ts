import { crypto, initEccLib } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import { constructClaimTransaction } from '../../../lib/swap/Claim';
import { detectPreimage } from '../../../lib/swap/PreimageDetector';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import {
  outputFunctionForType,
  p2trOutput,
  p2wpkhOutput,
} from '../../../lib/swap/Scripts';
import swapScript from '../../../lib/swap/SwapScript';
import swapTree from '../../../lib/swap/SwapTree';
import { ECPair } from '../Utils';

describe('PreimageDetector', () => {
  beforeAll(() => {
    initEccLib(ecc);
  });

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
  `('should detect preimage of $name input', ({ type, scriptFunc }) => {
    const redeemScript = scriptFunc(
      crypto.sha256(preimage),
      Buffer.from(claimKeys.publicKey),
      Buffer.from(refundKeys.publicKey),
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
      p2wpkhOutput(crypto.hash160(Buffer.from(claimKeys.publicKey))),
      2,
      false,
    );

    expect(detectPreimage(0, claimTransaction)).toEqual(preimage);
  });

  test.each`
    treeFunc           | name
    ${swapTree}        | ${'SwapTree'}
    ${reverseSwapTree} | ${'ReverseSwapTree'}
  `('should detect preimage of P2TR $name input', ({ treeFunc }) => {
    const claimTransaction = constructClaimTransaction(
      [
        {
          preimage,
          type: OutputType.Taproot,
          value: 123,
          vout: 0,
          txHash: randomBytes(32),
          cooperative: false,
          swapTree: treeFunc(
            false,
            crypto.sha256(preimage),
            claimKeys.publicKey,
            refundKeys.publicKey,
            1,
          ),
          internalKey: toXOnly(Buffer.from(claimKeys.publicKey)),
          keys: claimKeys,
          script: p2trOutput(Buffer.from(claimKeys.publicKey)),
        },
      ],
      p2wpkhOutput(crypto.hash160(Buffer.from(claimKeys.publicKey))),
      2,
      false,
    );

    expect(detectPreimage(0, claimTransaction)).toEqual(preimage);
  });
});
