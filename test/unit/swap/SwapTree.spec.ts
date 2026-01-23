import { secp256k1 } from '@noble/curves/secp256k1';
import { Script } from '@scure/btc-signer';
import { randomBytes } from 'node:crypto';
import {
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  fundingAddressTree,
  Musig,
  swapTree,
} from '../../../lib/Boltz';
import { toXOnly, tweakMusig } from '../../../lib/swap/TaprootUtils';
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
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    expect(tree.refundLeaf).toBeDefined();
    expect(tree.tree).toBe(tree.refundLeaf);
  });

  test('should create funding address tree with correct refund public key', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 123;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    const decodedScript = Script.decode(tree.refundLeaf.output);
    expect(decodedScript[0]).toEqual(toXOnly(refundKeys));
  });

  test('should create funding address tree with correct script structure', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    const decodedScript = Script.decode(tree.refundLeaf.output);
    // Script structure: [refundPublicKey, CHECKSIGVERIFY, timeout, CHECKLOCKTIMEVERIFY]
    expect(decodedScript[1]).toEqual('CHECKSIGVERIFY');
    expect(decodedScript[3]).toEqual('CHECKLOCKTIMEVERIFY');
  });

  test('should create funding address tree for Liquid', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 123;

    const treeBitcoin = fundingAddressTree(false, refundKeys, timeoutBlockHeight);
    const treeLiquid = fundingAddressTree(true, refundKeys, timeoutBlockHeight);

    // Liquid uses a different leaf version
    expect(treeLiquid.refundLeaf.version).not.toEqual(treeBitcoin.refundLeaf.version);
  });

  test('should work with tweakMusig', () => {
    const refundKeys = secp256k1.getPublicKey(
      secp256k1.utils.randomPrivateKey(),
    );
    const timeoutBlockHeight = 800000;

    const tree = fundingAddressTree(false, refundKeys, timeoutBlockHeight);

    const ourMusigKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourMusigKey,
      [
        ourMusigKey,
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key)),
      randomBytes(32),
    );

    const tweakedMusig = tweakMusig(musig, tree.tree);

    expect(tweakedMusig).toBeDefined();
    expect(tweakedMusig.pubkeyAgg).toBeDefined();
    // The tweaked pubkey should be different from the original
    expect(tweakedMusig.pubkeyAgg).not.toEqual(musig.pubkeyAgg);
  });
});
