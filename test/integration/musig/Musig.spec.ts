import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import { address, initEccLib, Transaction } from 'bitcoinjs-lib';
import zkp, { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { bitcoinClient } from '../Utils';
import { ECPair } from '../../unit/Utils';
import Musig from '../../../lib/musig/Musig';
import { Networks } from '../../../lib/Boltz';
import { getHexBuffer } from '../../../lib/Utils';
import { p2trOutput } from '../../../lib/swap/Scripts';

describe('Musig', () => {
  let secp: Secp256k1ZKP;

  beforeAll(async () => {
    secp = await zkp();
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
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      getHexBuffer(
        '02e88bd3780532bbb4a127a2e041467bc42c5cc4ff16ddb5afa7e27c5b653de44c',
      ),
    ]);
    expect(
      address.fromOutputScript(
        p2trOutput(musig.getAggregatedPublicKey()),
        Networks.bitcoinRegtest,
      ),
    ).toMatchSnapshot();
  });

  test('should spend Musig P2TR outputs', async () => {
    const ourKey = ECPair.makeRandom();
    const theirKey = ECPair.makeRandom();

    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      theirKey.publicKey,
    ]);

    // Fund address
    const outputScript = p2trOutput(musig.getAggregatedPublicKey());
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

    // Create signature
    const theirNonce = secp.musig.nonceGen(randomBytes(32), theirKey.publicKey);
    musig.aggregateNonces([[theirKey.publicKey, theirNonce.pubNonce]]);
    musig.initializeSession(sigHash);
    musig.signPartial();
    musig.addPartial(
      theirKey.publicKey,
      secp.musig.partialSign(
        theirNonce.secNonce,
        theirKey.privateKey!,
        musig['pubkeyAgg'].keyaggCache,
        musig['session']!,
      ),
    );

    // Finalize and broadcast
    tx.setWitness(0, [musig.aggregatePartials()]);

    await bitcoinClient.sendRawTransaction(tx.toHex());
  });
});
