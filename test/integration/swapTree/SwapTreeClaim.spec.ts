import zkp, { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { randomBytes } from 'crypto';
import { OutputType, constructClaimTransaction } from '../../../lib/Boltz';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../lib/swap/SwapTree';
import { hashForWitnessV1 } from '../../../lib/swap/TaprootUtils';
import { ECPair } from '../../unit/Utils';
import {
  bitcoinClient,
  claimSwap,
  createSwapOutput,
  destinationOutput,
  init,
} from '../Utils';

describe.each`
  name                 | treeFunc
  ${'SwapTree'}        | ${swapTree}
  ${'ReverseSwapTree'} | ${reverseSwapTree}
`('$name claim', ({ treeFunc }) => {
  let secp: Secp256k1ZKP;

  beforeAll(async () => {
    secp = await zkp();
    await Promise.all([init(), bitcoinClient.init()]);
  });

  afterEach(async () => {
    await bitcoinClient.generate(1);
  });

  test('should spend via key path', async () => {
    const { utxo, musig, refundKeys } = await createSwapOutput(
      OutputType.Taproot,
      false,
      treeFunc,
    );
    utxo.cooperative = true;

    const tx = constructClaimTransaction([utxo], destinationOutput, 1_000);

    // Check the dummy signature
    expect(tx.ins[0].witness).toHaveLength(1);
    expect(tx.ins[0].witness[0].equals(Buffer.alloc(64))).toEqual(true);

    const theirNonce = secp.musig.nonceGen(
      randomBytes(32),
      refundKeys.publicKey,
    );
    musig!.aggregateNonces([[refundKeys.publicKey, theirNonce.pubNonce]]);
    musig!.initializeSession(hashForWitnessV1([utxo], tx, 0));
    musig!.signPartial();
    musig!.addPartial(
      Buffer.from(refundKeys.publicKey),
      secp.musig.partialSign(
        theirNonce.secNonce,
        refundKeys.privateKey!,
        musig!['pubkeyAgg'].keyaggCache,
        musig!['session']!,
      ),
    );

    tx.setWitness(0, [musig!.aggregatePartials()]);

    await bitcoinClient.sendRawTransaction(tx.toHex());
  });

  test('should claim via script path', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      false,
      treeFunc,
    );
    await claimSwap([utxo]);
  });

  test('should not claim via script path when preimage is invalid', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      false,
      treeFunc,
    );
    utxo.preimage = randomBytes(32);

    try {
      await claimSwap([utxo]);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe(-26);
      expect(error.message).toContain(
        'mempool-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)',
      );
    }
  });

  test('should not claim via script path when claim key is invalid', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      false,
      treeFunc,
    );
    utxo.keys = ECPair.makeRandom();

    try {
      await claimSwap([utxo]);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe(-26);
      expect(error.message).toContain(
        'mempool-script-verify-flag-failed (Invalid Schnorr signature)',
      );
    }
  });
});
