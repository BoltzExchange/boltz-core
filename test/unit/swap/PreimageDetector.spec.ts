import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import { hash160 } from '@scure/btc-signer/utils.js';
import { randomBytes } from 'node:crypto';
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
import { toXOnly } from '../../../lib/swap/TaprootUtils';

describe('PreimageDetector', () => {
  const claimKeys = secp256k1.utils.randomPrivateKey();
  const refundKeys = secp256k1.utils.randomPrivateKey();

  const preimage = hex.decode(
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
      sha256(preimage),
      secp256k1.getPublicKey(claimKeys),
      secp256k1.getPublicKey(refundKeys),
      1,
    );
    const claimTransaction = constructClaimTransaction(
      [
        {
          preimage,
          redeemScript: Buffer.from(redeemScript),
          type: type,
          privateKey: claimKeys,
          vout: 0,
          amount: 123123n,
          script: outputFunctionForType(type)!(redeemScript),
          transactionId:
            '287d2e3a5726710c2b6c94084c28789b250d703feb1e10012921cc2d4ab7f277',
        },
      ],
      p2wpkhOutput(hash160(secp256k1.getPublicKey(claimKeys))),
      2n,
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
          amount: 123n,
          vout: 0,
          transactionId: randomBytes(32).toString('hex'),
          cooperative: false,
          swapTree: treeFunc(
            false,
            sha256(preimage),
            secp256k1.getPublicKey(claimKeys),
            secp256k1.getPublicKey(refundKeys),
            1,
          ),
          internalKey: toXOnly(secp256k1.getPublicKey(claimKeys)),
          privateKey: claimKeys,
          script: p2trOutput(secp256k1.getPublicKey(claimKeys)),
        },
      ],
      p2wpkhOutput(hash160(secp256k1.getPublicKey(claimKeys))),
      2n,
      false,
    );

    expect(detectPreimage(0, claimTransaction)).toEqual(preimage);
  });
});
