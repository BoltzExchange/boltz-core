import zkp, { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { randomBytes } from 'crypto';
import { OutputType } from '../../../../lib/Boltz';
import {
  LiquidClaimDetails,
  Networks,
  constructClaimTransaction,
  init,
} from '../../../../lib/liquid';
import { hashForWitnessV1 } from '../../../../lib/liquid/swap/TaprootUtils';
import reverseSwapTree from '../../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../../lib/swap/SwapTree';
import { ECPair, slip77 } from '../../../unit/Utils';
import {
  claimSwap,
  createSwapOutput,
  destinationOutput,
  elementsClient,
  init as utilsInit,
} from '../../Utils';

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
    const blindingKey = blindOutput
      ? slip77.derive(destinationOutput).publicKey!
      : undefined;

    let secp: Secp256k1ZKP;

    beforeAll(async () => {
      secp = await zkp();
      init(secp);
      await Promise.all([utilsInit(), elementsClient.init()]);
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
        destinationOutput,
        1_000,
        true,
        Networks.liquidRegtest,
        blindingKey,
      );

      // Check the dummy signature
      expect(tx.ins[0].witness).toHaveLength(1);
      expect(tx.ins[0].witness[0].equals(Buffer.alloc(64))).toEqual(true);

      const theirNonce = secp.musig.nonceGen(
        randomBytes(32),
        refundKeys.publicKey,
      );
      musig!.aggregateNonces([[refundKeys.publicKey, theirNonce.pubNonce]]);
      musig!.initializeSession(
        hashForWitnessV1(Networks.liquidRegtest, [utxo], tx, 0),
      );
      musig!.signPartial();
      musig!.addPartial(
        refundKeys.publicKey,
        secp.musig.partialSign(
          theirNonce.secNonce,
          refundKeys.privateKey!,
          musig!['pubkeyAgg'].keyaggCache,
          musig!['session']!,
        ),
      );

      tx.setWitness(0, [musig!.aggregatePartials()]);

      await elementsClient.sendRawTransaction(tx.toHex());
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
          'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
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
      utxo.keys = ECPair.makeRandom();

      await expect(claimSwap([utxo], blindingKey)).rejects.toEqual({
        code: -26,
        message: 'non-mandatory-script-verify-flag (Invalid Schnorr signature)',
      });
    });
  },
);
