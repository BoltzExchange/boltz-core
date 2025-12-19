import { Transaction, address, initEccLib } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import { Networks } from '../../../lib/Boltz';
import { getHexBuffer } from '../../../lib/Utils';
import Musig from '../../../lib/musig/Musig';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { ECPair } from '../../unit/Utils';
import { bitcoinClient } from '../Utils';

describe('Musig', () => {
  beforeAll(async () => {
    initEccLib(ecc);
    await bitcoinClient.init();
  });

  afterAll(async () => {
    await bitcoinClient.generate(1);
  });

  test('should create P2TR addresses', () => {
    const ourKey = ECPair.fromPrivateKey(
      getHexBuffer(
        '1f1d1a9d8c3507b251ff29096511ffe66a75437e3bcdf912e7433e55e87f569c',
      ),
    );
    const musig = new Musig(
      ourKey,
      [
        Buffer.from(ourKey.publicKey),
        getHexBuffer(
          '02e88bd3780532bbb4a127a2e041467bc42c5cc4ff16ddb5afa7e27c5b653de44c',
        ),
      ],
      randomBytes(32),
    );
    expect(
      address.fromOutputScript(
        p2trOutput(Buffer.from(musig.pubkeyAgg)),
        Networks.bitcoinRegtest,
      ),
    ).toMatchSnapshot();
  });

  test('should spend Musig P2TR outputs', async () => {
    const ourKey = ECPair.makeRandom();
    const theirKey = ECPair.makeRandom();

    let musig = new Musig(
      ourKey,
      [ourKey.publicKey, theirKey.publicKey].map(Buffer.from),
      randomBytes(32),
    );

    // Fund address
    const outputScript = p2trOutput(Buffer.from(musig.pubkeyAgg));
    const amount = 10_000;

    const txId = await bitcoinClient.sendToAddress(
      address.fromOutputScript(outputScript, Networks.bitcoinRegtest),
      amount,
    );
    const prevTx = Transaction.fromHex(
      await bitcoinClient.getRawTransaction(txId),
    );
    const outputIndex = prevTx.outs.findIndex((out) =>
      out.script.equals(outputScript),
    );

    // Construct transaction
    const tx = new Transaction();
    tx.addInput(prevTx.getHash(), outputIndex);
    tx.addOutput(
      address.toOutputScript(
        await bitcoinClient.getNewAddress(),
        Networks.bitcoinRegtest,
      ),
      amount - 1_000,
    );

    const sigHash = tx.hashForWitnessV1(
      0,
      [outputScript],
      [amount],
      Transaction.SIGHASH_DEFAULT,
    );
    musig = new Musig(
      ourKey,
      [ourKey.publicKey, theirKey.publicKey].map(Buffer.from),
      sigHash,
    );

    const theirMusig = new Musig(
      theirKey,
      [ourKey.publicKey, theirKey.publicKey].map(Buffer.from),
      sigHash,
    );

    // Create signature
    musig.aggregateNonces([[theirKey.publicKey, theirMusig.getPublicNonce()]]);
    theirMusig.aggregateNonces([[ourKey.publicKey, musig.getPublicNonce()]]);
    musig.signPartial();
    musig.addPartial(Buffer.from(theirKey.publicKey), theirMusig.signPartial());

    // Finalize and broadcast
    tx.setWitness(0, [Buffer.from(musig.aggregatePartials())]);

    await bitcoinClient.sendRawTransaction(tx.toHex());
  });
});
