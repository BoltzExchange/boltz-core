import zkp, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { Transaction, address } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import {
  Networks,
  OutputType,
  detectSwap,
  fundingAddressTree,
} from '../../../lib/Boltz';
import type { RefundDetails } from '../../../lib/consts/Types';
import Musig from '../../../lib/musig/Musig';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { tweakMusig } from '../../../lib/swap/TaprootUtils';
import { ECPair } from '../../unit/Utils';
import { bitcoinClient, generateKeys, init, refundSwap } from '../Utils';

const createFundingAddressOutput = async (
  secp: Secp256k1ZKP,
  timeoutBlockHeight: number,
): Promise<{
  utxo: RefundDetails;
  refundKeys: ReturnType<typeof generateKeys>;
}> => {
  const refundKeys = generateKeys();
  const refundPubKey = Buffer.from(refundKeys.publicKey);

  const tree = fundingAddressTree(false, refundPubKey, timeoutBlockHeight);

  const internalKeys = generateKeys();
  const musig = new Musig(
    secp,
    internalKeys,
    randomBytes(32),
    [internalKeys.publicKey, generateKeys().publicKey].map(Buffer.from),
  );

  const tweakedKey = tweakMusig(musig, tree.tree);
  const outputScript = p2trOutput(tweakedKey);

  const swapAddress = address.fromOutputScript(
    outputScript,
    Networks.bitcoinRegtest,
  );

  const transactionId = await bitcoinClient.sendToAddress(swapAddress, 10000);
  const txHex = await bitcoinClient.getRawTransaction(transactionId);
  const transaction = Transaction.fromHex(txHex);

  const detected = detectSwap(tweakedKey, transaction)!;

  const utxo = {
    ...detected,
    internalKey: musig.getAggregatedPublicKey(),
    txHash: transaction.getHash(),
    swapTree: tree,
    keys: refundKeys,
    type: OutputType.Taproot,
  } as RefundDetails;

  return {
    utxo,
    refundKeys,
  };
};

describe('FundingAddressTree refund', () => {
  let secp: Secp256k1ZKP;

  beforeAll(async () => {
    secp = await zkp();
    await Promise.all([init(), bitcoinClient.init()]);
  });

  afterEach(async () => {
    await bitcoinClient.generate(1);
  });

  test('should refund via script path', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(secp, timeout);
    await refundSwap([utxo], timeout);
  });

  test('should not refund via script path when timelock is not reached', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(secp, timeout + 21);

    await expect(refundSwap([utxo], timeout)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Locktime requirement not satisfied)',
      ),
    });
  });

  test('should not refund via script path when refund key is invalid', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(secp, timeout);
    utxo.keys = ECPair.makeRandom();

    await expect(refundSwap([utxo], timeout)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Invalid Schnorr signature)',
      ),
    });
  });
});
