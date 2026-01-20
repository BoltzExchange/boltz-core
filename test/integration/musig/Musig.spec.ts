import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { Address, OutScript, SigHash, Transaction } from '@scure/btc-signer';
import { equalBytes } from '@scure/btc-signer/utils.js';
import Networks from '../../../lib/consts/Networks';
import * as Musig from '../../../lib/musig/Musig';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { bitcoinClient, encodeAddress } from '../Utils';

describe('Musig', () => {
  beforeAll(async () => {
    await bitcoinClient.init();
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });

  test('should create P2TR addresses', () => {
    const ourKey = hex.decode(
      '1f1d1a9d8c3507b251ff29096511ffe66a75437e3bcdf912e7433e55e87f569c',
    );
    const musig = Musig.create(ourKey, [
      secp256k1.getPublicKey(ourKey),
      hex.decode(
        '02e88bd3780532bbb4a127a2e041467bc42c5cc4ff16ddb5afa7e27c5b653de44c',
      ),
    ]);
    expect(
      Address(Networks.regtest).encode({
        type: 'tr',
        pubkey: musig.aggPubkey,
      }),
    ).toMatchSnapshot();
  });

  test('should spend Musig P2TR outputs', async () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const theirKey = secp256k1.utils.randomPrivateKey();

    const keyAgg = Musig.create(
      ourKey,
      [ourKey, theirKey].map((k) => secp256k1.getPublicKey(k)),
    );

    // Fund address
    const amount = 10_000n;

    const outputScript = p2trOutput(keyAgg.aggPubkey);
    const txId = await bitcoinClient.sendToAddress(
      encodeAddress(outputScript),
      Number(amount),
    );
    const prevTx = Transaction.fromRaw(
      hex.decode(await bitcoinClient.getRawTransaction(txId)),
    );

    const outputIndex = Array.from(
      { length: prevTx.outputsLength },
      (_, i) => i,
    ).find((i) => equalBytes(prevTx.getOutput(i).script!, outputScript));
    expect(outputIndex).not.toBeUndefined();

    // Construct transaction
    const tx = new Transaction();
    tx.addInput({
      txid: prevTx.id,
      index: outputIndex,
    });
    tx.addOutput({
      script: OutScript.encode(
        Address(Networks.regtest).decode(await bitcoinClient.getNewAddress()),
      ),
      amount: amount - 1_000n,
    });

    const sigHash = tx.preimageWitnessV1(0, [outputScript], SigHash.DEFAULT, [
      amount,
    ]);

    // Create musig sessions for signing
    const ourWithNonce = keyAgg.message(sigHash).generateNonce();
    const theirWithNonce = Musig.create(
      theirKey,
      [ourKey, theirKey].map((k) => secp256k1.getPublicKey(k)),
    )
      .message(sigHash)
      .generateNonce();

    // Aggregate nonces
    const ourAggregated = ourWithNonce.aggregateNonces([
      [secp256k1.getPublicKey(theirKey), theirWithNonce.publicNonce],
    ]);
    const theirAggregated = theirWithNonce.aggregateNonces([
      [secp256k1.getPublicKey(ourKey), ourWithNonce.publicNonce],
    ]);

    // Initialize sessions and sign
    let ourSigned = ourAggregated.initializeSession().signPartial();
    const theirSigned = theirAggregated.initializeSession().signPartial();

    // Add counterparty signatures
    ourSigned = ourSigned.addPartial(
      secp256k1.getPublicKey(theirKey),
      theirSigned.ourPartialSignature,
    );

    // Finalize and broadcast
    tx.updateInput(0, {
      finalScriptWitness: [ourSigned.aggregatePartials()],
    });

    await bitcoinClient.sendRawTransaction(tx.hex);
  });
});
