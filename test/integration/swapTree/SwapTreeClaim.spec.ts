import { secp256k1 } from '@noble/curves/secp256k1';
import { SigHash } from '@scure/btc-signer';
import { randomBytes } from 'crypto';
import { Musig, OutputType } from '../../../lib/Boltz';
import { constructClaimTransaction } from '../../../lib/swap/Claim';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import swapTree from '../../../lib/swap/SwapTree';
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
  beforeAll(async () => {
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

    const tx = constructClaimTransaction(
      [utxo],
      Buffer.from(destinationOutput),
      1_000n,
    );

    // Check the dummy signature
    expect(tx.getInput(0).finalScriptWitness).toHaveLength(1);
    expect(
      Buffer.from(tx.getInput(0).finalScriptWitness![0] as Uint8Array).equals(
        Buffer.alloc(64),
      ),
    ).toEqual(true);

    const sigHash = tx.preimageWitnessV1(
      0,
      [Buffer.from(utxo.script)],
      SigHash.DEFAULT,
      [utxo.amount],
    );

    const updatedMusig = Musig.updateMessage(musig!, sigHash);
    const theirMusig = new Musig(
      refundKeys,
      [updatedMusig!.publicKeys[0], secp256k1.getPublicKey(refundKeys)],
      sigHash,
      updatedMusig.tweak,
    );

    updatedMusig.aggregateNonces([
      [secp256k1.getPublicKey(refundKeys), theirMusig.getPublicNonce()],
    ]);
    theirMusig.aggregateNonces([
      [updatedMusig!.publicKeys[0], updatedMusig.getPublicNonce()],
    ]);

    updatedMusig.signPartial();
    updatedMusig.addPartial(
      secp256k1.getPublicKey(refundKeys),
      theirMusig.signPartial(),
    );

    tx.updateInput(0, {
      finalScriptWitness: [updatedMusig.aggregatePartials()],
    });

    await bitcoinClient.sendRawTransaction(tx.hex);
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
    utxo.privateKey = secp256k1.utils.randomPrivateKey();

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
