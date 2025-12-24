import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { hash160 } from '@scure/btc-signer/utils.js';
import zkp from '@vulpemventures/secp256k1-zkp';
import { confidential } from 'liquidjs-lib';
import { OutputType } from '../../../../lib/consts/Enums';
import { constructClaimTransaction, init } from '../../../../lib/liquid';
import { detectPreimage } from '../../../../lib/swap/PreimageDetector';
import reverseSwapScript from '../../../../lib/swap/ReverseSwapScript';
import {
  outputFunctionForType,
  p2wpkhOutput,
} from '../../../../lib/swap/Scripts';
import swapScript from '../../../../lib/swap/SwapScript';
import { lbtcRegtest, nonce } from './ClaimDetails';

describe('Liquid PreimageDetector', () => {
  const claimKeys = secp256k1.utils.randomPrivateKey();
  const refundKeys = secp256k1.utils.randomPrivateKey();

  const preimage = hex.decode(
    '7568110bcf788e974f918332f357dec2c33b2d76b2f61f9873afcb8f1598c91e',
  );

  beforeAll(async () => {
    init(await zkp());
  });

  test.each`
    type                 | scriptFunc           | name
    ${OutputType.Bech32} | ${swapScript}        | ${'P2WSH swap'}
    ${OutputType.Bech32} | ${reverseSwapScript} | ${'P2WSH reverse swap'}
  `('should detect preimage of $name input', ({ type, scriptFunc }) => {
    const redeemScript = scriptFunc(
      hash160(preimage),
      secp256k1.getPublicKey(claimKeys),
      secp256k1.getPublicKey(refundKeys),
      1,
    );
    const claimTransaction = constructClaimTransaction(
      [
        {
          nonce,
          preimage,
          redeemScript: Buffer.from(redeemScript),
          type: type,
          privateKey: claimKeys,
          vout: 0,
          value: confidential.satoshiToConfidentialValue(123123),
          script: Buffer.from(outputFunctionForType(type)!(redeemScript)),
          transactionId:
            '287d2e3a5726710c2b6c94084c28789b250d703feb1e10012921cc2d4ab7f277',
          asset: lbtcRegtest,
        },
      ],
      Buffer.from(p2wpkhOutput(hash160(secp256k1.getPublicKey(claimKeys)))),
      2n,
      false,
    );

    const foundPreimage = detectPreimage(0, claimTransaction);
    expect(foundPreimage).toEqual(preimage);
  });

  test('should detect preimage of P2TR covenant claim inputs', () => {
    const witness = [
      '95a65f7ca829cb5b6962194197dcdc2702842120621f2b7d9e362ac399609160',
      '82012088a914260e080b2811629fb645b488376844000320d2388800d15188209dbd4a290dab27ee9d0f84dd43c7aeafccc1315dcffc1fe7cf6fde994e793fdf8800ce752025b251070e29ca19043cf33ccd7324e2ddab03ecc4ae0b5e77c4fc0e5cf6c95a8800cf7508102700000000000087',
      'c5c93afa449a4d97e1b212d23ac87f36f71871428c0656fdc620f2bd48b63d5da4054cff664073a3f951ab0e7a646540686cc5dcdb0ee4b2290ade5e8fe85a831625368ca12f9fb66de62446fcb1fe7e9ae77a465dad9cdc8fa21c8c5fc1eaac93',
    ].map((w) => Buffer.from(w, 'hex'));

    expect(
      detectPreimage(0, {
        ins: [
          {
            witness,
            script: Buffer.alloc(0),
          },
        ],
      }),
    ).toEqual(witness[0]);
  });
});
