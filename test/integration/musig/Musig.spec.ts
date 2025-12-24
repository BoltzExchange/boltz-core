import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { Address, OutScript, SigHash, Transaction } from '@scure/btc-signer';
import { equalBytes } from '@scure/btc-signer/utils.js';
import { randomBytes } from 'crypto';
import Networks from '../../../lib/consts/Networks';
import Musig from '../../../lib/musig/Musig';
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
    const musig = new Musig(
      ourKey,
      [
        secp256k1.getPublicKey(ourKey),
        hex.decode(
          '02e88bd3780532bbb4a127a2e041467bc42c5cc4ff16ddb5afa7e27c5b653de44c',
        ),
      ],
      randomBytes(32),
    );
    expect(
      Address(Networks.regtest).encode({
        type: 'tr',
        pubkey: musig.pubkeyAgg,
      }),
    ).toMatchSnapshot();
  });

  test('should spend Musig P2TR outputs', async () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const theirKey = secp256k1.utils.randomPrivateKey();

    let musig = new Musig(
      ourKey,
      [ourKey, theirKey].map((k) => secp256k1.getPublicKey(k)),
      randomBytes(32),
    );

    // Fund address
    const amount = 10_000n;

    const outputScript = p2trOutput(musig.pubkeyAgg);
    const txId = await bitcoinClient.sendToAddress(
      encodeAddress(outputScript),
      Number(amount),
    );
    const prevTx = Transaction.fromRaw(
      hex.decode(await bitcoinClient.getRawTransaction(txId)),
    );

    let outputIndex = -1;
    for (let i = 0; i < prevTx.outputsLength; i++) {
      if (equalBytes(prevTx.getOutput(i).script!, outputScript)) {
        outputIndex = i;
        break;
      }
    }
    expect(outputIndex).not.toEqual(-1);

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
    musig = new Musig(
      ourKey,
      [ourKey, theirKey].map((k) => secp256k1.getPublicKey(k)),
      sigHash,
    );

    const theirMusig = new Musig(
      theirKey,
      [ourKey, theirKey].map((k) => secp256k1.getPublicKey(k)),
      sigHash,
    );

    // Create signature
    musig.aggregateNonces([
      [secp256k1.getPublicKey(theirKey), theirMusig.getPublicNonce()],
    ]);
    theirMusig.aggregateNonces([
      [secp256k1.getPublicKey(ourKey), musig.getPublicNonce()],
    ]);
    musig.signPartial();
    musig.addPartial(
      secp256k1.getPublicKey(theirKey),
      theirMusig.signPartial(),
    );

    // Finalize and broadcast
    tx.updateInput(0, {
      finalScriptWitness: [musig.aggregatePartials()],
    });

    await bitcoinClient.sendRawTransaction(tx.hex);
  });
});
