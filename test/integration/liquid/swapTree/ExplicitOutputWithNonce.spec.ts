import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { signSchnorr } from '@scure/btc-signer/utils.js';
import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import zkp from '@vulpemventures/secp256k1-zkp';
import { Transaction, address, confidential, networks } from 'liquidjs-lib';
import { randomBytes } from 'node:crypto';
import { Musig, OutputType } from '../../../../lib/Boltz';
import { constructRefundTransaction, init } from '../../../../lib/liquid';
import { tweakMusig } from '../../../../lib/liquid/swap/TaprootUtils';
import { p2trOutput } from '../../../../lib/swap/Scripts';
import swapTree from '../../../../lib/swap/SwapTree';
import { elementsClient, generateKeys } from '../../Utils';

describe('ExplicitOutputWithNonce', () => {
  let secp: Secp256k1ZKP;

  beforeAll(async () => {
    secp = await zkp();
    await elementsClient.init();
  });

  afterEach(async () => {
    await elementsClient.generate(1);
  });

  test('should be able to spend an explicit output with a confidential nonce', async () => {
    const keys = generateKeys();
    const outputScript = p2trOutput(secp256k1.getPublicKey(keys));
    const addr = address.fromOutputScript(
      Buffer.from(outputScript),
      networks.regtest,
    );

    const transaction = Transaction.fromHex(
      await elementsClient.getRawTransaction(
        await elementsClient.sendToAddress(addr, 10_000),
      ),
    );
    const vout = transaction.outs.findIndex((v) =>
      v.script.equals(outputScript),
    );
    expect(vout).not.toEqual(-1);
    const prevOut = transaction.outs[vout];

    const claimKeys = generateKeys();
    const refundKeys = generateKeys();
    const timeoutBlockHeight = (await elementsClient.getBlockchainInfo())
      .blocks;
    const preimage = randomBytes(32);

    const tree = swapTree(
      true,
      sha256(preimage),
      secp256k1.getPublicKey(claimKeys),
      secp256k1.getPublicKey(refundKeys),
      timeoutBlockHeight,
    );
    const musig = tweakMusig(
      Musig.create(
        claimKeys,
        [claimKeys, refundKeys].map((k) => secp256k1.getPublicKey(k)),
      ),
      tree.tree,
    );
    const swapOutputScript = p2trOutput(musig.aggPubkey);

    const swapTx = new Transaction();
    swapTx.addInput(transaction.getHash(), vout);
    swapTx.addOutput(
      Buffer.from(swapOutputScript),
      confidential.satoshiToConfidentialValue(
        confidential.confidentialValueToSatoshi(prevOut.value) - 100,
      ),
      prevOut.asset,
      Buffer.alloc(1),
    );
    swapTx.addOutput(
      Buffer.alloc(0),
      confidential.satoshiToConfidentialValue(100),
      prevOut.asset,
      Buffer.alloc(1),
    );

    swapTx.outs[0].nonce = Buffer.from(
      '02b3e1ade7cd37505988723a8f05e1ae17e8f072e6339215e4f6d28aca692f6bf7',
      'hex',
    );

    swapTx.ins[0].witness = [
      Buffer.from(
        signSchnorr(
          swapTx.hashForWitnessV1(
            0,
            [prevOut.script],
            [
              {
                asset: prevOut.asset,
                value: prevOut.value,
              },
            ],
            Transaction.SIGHASH_DEFAULT,
            networks.regtest.genesisBlockHash,
          ),
          keys,
        ),
      ),
    ];

    expect(swapTx.outs[0].nonce.length).toBeGreaterThan(1);

    init(secp);
    const refundTx = constructRefundTransaction(
      [
        {
          ...swapTx.outs[0],
          vout: 0,
          swapTree: tree,
          privateKey: refundKeys,
          cooperative: false,
          type: OutputType.Taproot,
          transactionId: swapTx.getId(),
          internalKey: musig.internalKey,
        },
      ],
      Buffer.from(outputScript),
      timeoutBlockHeight,
      100n,
      true,
      networks.regtest,
    );

    // Elements does not allow us to send the lockup transaction, so we just test mempool acceptance
    const res = await elementsClient.testMempoolAccept(
      swapTx.toHex(),
      refundTx.toHex(),
    );
    expect(res.every((r) => r.allowed)).toEqual(true);
  });
});
