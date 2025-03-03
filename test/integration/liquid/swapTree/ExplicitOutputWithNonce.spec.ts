import zkp, { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { crypto } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import { Transaction, address, confidential, networks } from 'liquidjs-lib';
import { Musig, OutputType } from '../../../../lib/Boltz';
import { getHexBuffer } from '../../../../lib/Utils';
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
    const outputScript = p2trOutput(keys.publicKey!);
    const addr = address.fromOutputScript(outputScript, networks.regtest);

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
      crypto.sha256(preimage),
      claimKeys.publicKey,
      refundKeys.publicKey,
      timeoutBlockHeight,
    );
    const musig = new Musig(secp, claimKeys, randomBytes(32), [
      claimKeys.publicKey,
      refundKeys.publicKey,
    ]);
    const tweakedKey = tweakMusig(musig, tree.tree);
    const swapOutputScript = p2trOutput(tweakedKey);

    const swapTx = new Transaction();
    swapTx.addInput(transaction.getHash(), vout);
    swapTx.addOutput(
      swapOutputScript,
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

    swapTx.outs[0].nonce = getHexBuffer(
      '02b3e1ade7cd37505988723a8f05e1ae17e8f072e6339215e4f6d28aca692f6bf7',
    );

    swapTx.ins[0].witness = [
      keys.signSchnorr(
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
          keys: refundKeys,
          cooperative: false,
          type: OutputType.Taproot,
          txHash: swapTx.getHash(),
          internalKey: musig.getAggregatedPublicKey(),
        },
      ],
      outputScript,
      timeoutBlockHeight,
      100,
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
