import { secp256k1 } from '@noble/curves/secp256k1';
import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import zkp from '@vulpemventures/secp256k1-zkp';
import { randomBytes } from 'node:crypto';
import { Musig, OutputType } from '../../../../lib/Boltz';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import {
  Networks,
  constructClaimTransaction,
  init,
} from '../../../../lib/liquid';
import { hashForWitnessV1 } from '../../../../lib/liquid/swap/TaprootUtils';
import reverseSwapTree from '../../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../../lib/swap/SwapTree';
import { slip77 } from '../../../unit/Utils';
import {
  claimSwap,
  createSwapOutput,
  destinationOutput,
  elementsClient,
  init as utilsInit,
} from '../../Utils';

let secpZkp: Secp256k1ZKP;

const initSecpZkp = async () => {
  if (secpZkp) {
    return secpZkp;
  }

  secpZkp = await zkp();
  return secpZkp;
};

describe.each`
  name                 | treeFunc           | blindInputs | blindOutput
  ${'SwapTree'}        | ${swapTree}        | ${false}    | ${false}
  ${'SwapTree'}        | ${swapTree}        | ${false}    | ${true}
  ${'SwapTree'}        | ${swapTree}        | ${true}     | ${false}
  ${'SwapTree'}        | ${swapTree}        | ${true}     | ${true}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${false}    | ${false}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${false}    | ${true}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${true}     | ${false}
  ${'ReverseSwapTree'} | ${reverseSwapTree} | ${true}     | ${true}
`(
  '$name claim (inputs blinded $blindInputs; output blinded $blindOutput)',
  ({ treeFunc, blindInputs, blindOutput }) => {
    let blindingKey: Buffer | undefined;

    beforeAll(async () => {
      if (blindOutput) {
        blindingKey = slip77(await initSecpZkp()).derive(
          Buffer.from(destinationOutput),
        ).publicKey!;
      }

      init(await initSecpZkp());
      utilsInit();
      await elementsClient.init();
    });

    afterEach(async () => {
      await elementsClient.generate(1);
    });

    test('should spend via key path', async () => {
      const { utxo, musig, refundKeys } =
        await createSwapOutput<LiquidClaimDetails>(
          OutputType.Taproot,
          false,
          treeFunc,
          undefined,
          blindInputs,
        );
      utxo.cooperative = true;

      const tx = constructClaimTransaction(
        [utxo],
        Buffer.from(destinationOutput),
        1_000n,
        true,
        Networks.liquidRegtest,
        blindingKey,
      );

      // Check the dummy signature
      expect(tx.ins[0].witness).toHaveLength(1);
      expect(tx.ins[0].witness[0].equals(Buffer.alloc(64))).toEqual(true);

      expect(tx.outs[0].rangeProof!.length !== 0).toEqual(blindOutput);

      const sigHash = hashForWitnessV1(Networks.liquidRegtest, [utxo], tx, 0);

      // Apply the same tweak to create a new MusigKeyAgg, then set message
      const tweakedMusig = musig!.tweak
        ? Musig.create(utxo.privateKey!, musig!.publicKeys).xonlyTweakAdd(
            musig!.tweak,
          )
        : Musig.create(utxo.privateKey!, musig!.publicKeys);

      const ourWithNonce = tweakedMusig.message(sigHash).generateNonce();
      const theirWithNonce = (
        musig!.tweak
          ? Musig.create(refundKeys, [
              musig!.publicKeys[0],
              secp256k1.getPublicKey(refundKeys),
            ]).xonlyTweakAdd(musig!.tweak)
          : Musig.create(refundKeys, [
              musig!.publicKeys[0],
              secp256k1.getPublicKey(refundKeys),
            ])
      )
        .message(sigHash)
        .generateNonce();

      const ourAggregated = ourWithNonce.aggregateNonces([
        [secp256k1.getPublicKey(refundKeys), theirWithNonce.publicNonce],
      ]);
      const theirAggregated = theirWithNonce.aggregateNonces([
        [musig!.publicKeys[0], ourWithNonce.publicNonce],
      ]);

      let ourSigned = ourAggregated.initializeSession().signPartial();
      const theirSigned = theirAggregated.initializeSession().signPartial();

      ourSigned = ourSigned.addPartial(
        secp256k1.getPublicKey(refundKeys),
        theirSigned.ourPartialSignature,
      );

      tx.setWitness(0, [Buffer.from(ourSigned.aggregatePartials())]);

      await elementsClient.sendRawTransaction(tx.toHex());
      const info = await elementsClient.getRawTransactionVerbose(tx.getId());
      expect(info.vsize).toEqual(tx.virtualSize(false));
      expect(info.discountvsize).toEqual(tx.virtualSize(true));
    });

    test('should claim via script path', async () => {
      const { utxo } = await createSwapOutput<LiquidClaimDetails>(
        OutputType.Taproot,
        false,
        treeFunc,
        undefined,
        blindInputs,
      );
      await claimSwap([utxo], blindingKey);
    });

    test('should not claim via script path when preimage is invalid', async () => {
      const { utxo } = await createSwapOutput<LiquidClaimDetails>(
        OutputType.Taproot,
        false,
        treeFunc,
        undefined,
        blindInputs,
      );
      utxo.preimage = randomBytes(32);

      await expect(claimSwap([utxo], blindingKey)).rejects.toEqual({
        code: -26,
        message:
          'mempool-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)',
      });
    });

    test('should not claim via script path when claim key is invalid', async () => {
      const { utxo } = await createSwapOutput<LiquidClaimDetails>(
        OutputType.Taproot,
        false,
        treeFunc,
        undefined,
        blindInputs,
      );
      utxo.privateKey = secp256k1.utils.randomPrivateKey();

      await expect(claimSwap([utxo], blindingKey)).rejects.toEqual({
        code: -26,
        message:
          'mempool-script-verify-flag-failed (Invalid Schnorr signature)',
      });
    });
  },
);
