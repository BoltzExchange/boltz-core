import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';
import { taprootTweakPubkey } from '@scure/btc-signer/utils.js';
import { OutputType, detectSwap, fundingAddressTree } from '../../../lib/Boltz';
import type { RefundDetails } from '../../../lib/consts/Types';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { taprootHashTree, toXOnly } from '../../../lib/swap/TaprootUtils';
import {
  bitcoinClient,
  encodeAddress,
  generateKeys,
  refundSwap,
} from '../Utils';

const createFundingAddressOutput = async (
  timeoutBlockHeight: number,
): Promise<{
  utxo: RefundDetails;
  refundKeys: Uint8Array;
}> => {
  const refundKeys = generateKeys();
  const refundPubKey = secp256k1.getPublicKey(refundKeys);

  const tree = fundingAddressTree(false, refundPubKey, timeoutBlockHeight);

  const internalKey = toXOnly(secp256k1.getPublicKey(generateKeys()));
  const treeHash = taprootHashTree(tree.tree).hash;
  const [tweakedPubKey] = taprootTweakPubkey(internalKey, treeHash);

  const outputScript = p2trOutput(tweakedPubKey);
  const swapAddress = encodeAddress(outputScript);

  const transactionId = await bitcoinClient.sendToAddress(swapAddress, 10000);
  const txHex = await bitcoinClient.getRawTransaction(transactionId);
  const transaction = Transaction.fromRaw(hex.decode(txHex));

  const detected = detectSwap(tweakedPubKey, transaction)!;

  const utxo = {
    ...detected,
    internalKey,
    transactionId,
    swapTree: tree,
    privateKey: refundKeys,
    type: OutputType.Taproot,
  } as RefundDetails;

  return {
    utxo,
    refundKeys,
  };
};

describe('FundingAddressTree refund', () => {
  beforeAll(async () => {
    await bitcoinClient.init();
  });

  afterEach(async () => {
    await bitcoinClient.generate(1);
  });

  test('should refund via script path', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(timeout);
    await refundSwap([utxo], timeout);
  });

  test('should not refund via script path when timelock is not reached', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(timeout + 21);

    await expect(refundSwap([utxo], timeout)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Locktime requirement not satisfied)',
      ),
    });
  });

  test('should not refund via script path when refund key is invalid', async () => {
    const timeout = (await bitcoinClient.getBlockchainInfo()).blocks;
    const { utxo } = await createFundingAddressOutput(timeout);
    utxo.privateKey = secp256k1.utils.randomPrivateKey();

    await expect(refundSwap([utxo], timeout)).rejects.toMatchObject({
      code: -26,
      message: expect.stringContaining(
        'mempool-script-verify-flag-failed (Invalid Schnorr signature)',
      ),
    });
  });
});
