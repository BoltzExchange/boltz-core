import { randomBytes } from 'crypto';
import zkp, { Secp256k1ZKP } from '@michael1011/secp256k1-zkp';
import {
  bitcoinClient,
  claimSwap,
  createSwapOutput,
  destinationOutput,
  init,
} from '../Utils';
import { ECPair } from '../../unit/Utils';
import swapTree from '../../../lib/swap/SwapTree';
import reverseSwapTree from '../../../lib/swap/ReverseSwapTree';
import { hashForWitnessV1 } from '../../../lib/swap/TaprootUtils';
import { constructClaimTransaction, OutputType } from '../../../lib/Boltz';

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

    const theirNonce = secp.musig.nonceGen(randomBytes(32));
    musig!.aggregateNonces(
      new Map([[refundKeys.publicKey, theirNonce.pubNonce]]),
    );
    musig!.initializeSession(hashForWitnessV1([utxo], tx, 0));
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

    await expect(claimSwap([utxo])).rejects.toEqual({
      code: -26,
      message:
        'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
    });
  });

  test('should not claim via script path when claim key is invalid', async () => {
    const { utxo } = await createSwapOutput(
      OutputType.Taproot,
      false,
      treeFunc,
    );
    utxo.keys = ECPair.makeRandom();

    await expect(claimSwap([utxo])).rejects.toEqual({
      code: -26,
      message: 'non-mandatory-script-verify-flag (Invalid Schnorr signature)',
    });
  });
});
