import zkp from '@vulpemventures/secp256k1-zkp';
import { script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { randomBytes } from 'crypto';
import {
  Musig,
  TaprootUtils,
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  fundingAddressTree,
  swapTree,
} from '../../../lib/Boltz';
import { ECPair } from '../Utils';

describe('SwapTree', () => {
  test('should extract claim public key from swap tree', () => {
    const claimKeys = Buffer.from(ECPair.makeRandom().publicKey);

    const tree = swapTree(
      false,
      randomBytes(32),
      claimKeys,
      Buffer.from(ECPair.makeRandom().publicKey),
      123,
    );

    expect(extractClaimPublicKeyFromSwapTree(tree)).toEqual(toXOnly(claimKeys));
  });

  test('should extract refund public key from swap tree', () => {
    const refundKeys = Buffer.from(ECPair.makeRandom().publicKey);

    const tree = swapTree(
      false,
      randomBytes(32),
      Buffer.from(ECPair.makeRandom().publicKey),
      refundKeys,
      123,
    );

    expect(extractRefundPublicKeyFromSwapTree(tree)).toEqual(
      toXOnly(refundKeys),
    );
  });
});

describe('FundingAddressTree', () => {
  test('should create funding address tree with refund leaf', () => {
    const refundKeys = Buffer.from(ECPair.makeRandom().publicKey);
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    expect(tree.refundLeaf).toBeDefined();
    expect(tree.tree).toBe(tree.refundLeaf);
    const decodedScript = script.decompile(tree.refundLeaf.output);
    expect(decodedScript![0]).toEqual(toXOnly(refundKeys));
  });

  test('should create funding address tree for Liquid', () => {
    const refundKeys = Buffer.from(ECPair.makeRandom().publicKey);
    const timeoutBlockHeight = 123;

    const treeBitcoin = fundingAddressTree(
      false,
      refundKeys,
      timeoutBlockHeight,
    );
    const treeLiquid = fundingAddressTree(true, refundKeys, timeoutBlockHeight);

    // Liquid uses a different leaf version
    expect(treeLiquid.refundLeaf.version).not.toEqual(
      treeBitcoin.refundLeaf.version,
    );
  });

  test('should work with tweakMusig', async () => {
    const secp = await zkp();
    const refundKeys = Buffer.from(ECPair.makeRandom().publicKey);
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    const ourMusigKey = ECPair.makeRandom();
    const musig = new Musig(
      secp,
      ourMusigKey,
      randomBytes(32),
      [ourMusigKey.publicKey, ECPair.makeRandom().publicKey].map(Buffer.from),
    );

    const tweakedKey = TaprootUtils.tweakMusig(musig, tree.tree);

    expect(tweakedKey).toBeDefined();
    // The tweaked pubkey should be different from the original
    expect(tweakedKey).not.toEqual(musig.getAggregatedPublicKey());
  });
});
