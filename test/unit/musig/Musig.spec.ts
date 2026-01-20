import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { nonceGen } from '@scure/btc-signer/musig2.js';
import zkpInit, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { randomBytes } from 'node:crypto';
import * as Musig from '../../../lib/musig/Musig';
import {
  MusigKeyAgg,
  MusigNoncesAggregated,
  MusigSession,
  MusigSigned,
  MusigWithMessage,
  MusigWithNonce,
} from '../../../lib/musig/Musig';
import { toXOnly } from '../../../lib/swap/TaprootUtils';

describe('Musig', () => {
  let secpZkp: Secp256k1ZKP;

  beforeAll(async () => {
    secpZkp = await zkpInit();
  });

  describe('Musig.create', () => {
    test('should create MusigKeyAgg', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      ];

      const publicKeys = [secp256k1.getPublicKey(ourKey), ...otherKeys];
      const musig = Musig.create(ourKey, publicKeys);

      expect(musig).toBeInstanceOf(MusigKeyAgg);
      expect(musig.aggPubkey).toBeDefined();
      expect(musig.internalKey).toBeDefined();
      expect(musig.publicKeys).toEqual(publicKeys);
      expect(musig.numParticipants).toEqual(3);
    });

    test('should not create when our key is not in publicKeys', () => {
      expect(() =>
        Musig.create(secp256k1.utils.randomPrivateKey(), [
          secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
          secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        ]),
      ).toThrow('our key is not in publicKeys');
    });

    test('should not create when less than 2 keys are provided', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();

      expect(() => Musig.create(ourKey, [])).toThrow(
        'need at least 2 keys to aggregate',
      );
      expect(() =>
        Musig.create(ourKey, [secp256k1.getPublicKey(ourKey)]),
      ).toThrow('need at least 2 keys to aggregate');
    });

    test('should not create when duplicate public keys are provided', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const ourPubKey = secp256k1.getPublicKey(ourKey);

      expect(() => Musig.create(ourKey, [ourPubKey, ourPubKey])).toThrow(
        `duplicate public key ${hex.encode(ourPubKey)}`,
      );
    });

    test('should not create when public key length is invalid', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const ourPubKey = secp256k1.getPublicKey(ourKey);
      const invalidKey = new Uint8Array(32);

      expect(() => Musig.create(ourKey, [ourPubKey, invalidKey])).toThrow(
        'public key must be 33 bytes, got 32',
      );
    });
  });

  describe('MusigKeyAgg', () => {
    test('should get number of participants', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const musig = Musig.create(
        ourKey,
        [
          ourKey,
          secp256k1.utils.randomPrivateKey(),
          secp256k1.utils.randomPrivateKey(),
          secp256k1.utils.randomPrivateKey(),
        ].map((key) => secp256k1.getPublicKey(key)),
      );
      expect(musig.numParticipants).toEqual(4);
    });

    test('should tweak with xonlyTweakAdd', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [
        ourKey,
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key));

      const musigNoTweak = Musig.create(ourKey, publicKeys);
      const tweak = randomBytes(32);
      const musigWithTweak = musigNoTweak.xonlyTweakAdd(tweak);

      // Verify that tweaked pubkey is different from untweaked
      expect(musigWithTweak.aggPubkey).not.toEqual(musigNoTweak.aggPubkey);

      // Verify that tweaking produces the expected result
      const expectedTweaked = secpZkp.ecc.xOnlyPointAddTweak(
        toXOnly(musigNoTweak.aggPubkey),
        tweak,
      );
      expect(expectedTweaked).not.toBeNull();
      expect(musigWithTweak.aggPubkey).toEqual(expectedTweaked!.xOnlyPubkey);

      // Verify tweak is stored
      expect(musigNoTweak.tweak).toBeUndefined();
      expect(musigWithTweak.tweak).toEqual(tweak);
    });

    test('should not allow tweaking twice', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, secp256k1.utils.randomPrivateKey()].map(
        (key) => secp256k1.getPublicKey(key),
      );

      const tweaked = Musig.create(ourKey, publicKeys).xonlyTweakAdd(
        randomBytes(32),
      );

      expect(() => tweaked.xonlyTweakAdd(randomBytes(32))).toThrow(
        'musig key already tweaked',
      );
    });

    test('should transition to MusigWithMessage', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, secp256k1.utils.randomPrivateKey()].map(
        (key) => secp256k1.getPublicKey(key),
      );

      const keyAgg = Musig.create(ourKey, publicKeys);
      const msg = randomBytes(32);
      const withMessage = keyAgg.message(msg);

      expect(withMessage).toBeInstanceOf(MusigWithMessage);
      expect(withMessage.msg).toEqual(msg);
      expect(withMessage.aggPubkey).toEqual(keyAgg.aggPubkey);
    });

    test('should expose myPublicKey and myIndex', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();
      const ourPubKey = secp256k1.getPublicKey(ourKey);
      const otherPubKey = secp256k1.getPublicKey(otherKey);

      const keyAgg1 = Musig.create(ourKey, [ourPubKey, otherPubKey]);
      expect(keyAgg1.myPublicKey).toEqual(ourPubKey);
      expect(keyAgg1.myIndex).toEqual(0);

      const keyAgg2 = Musig.create(ourKey, [otherPubKey, ourPubKey]);
      expect(keyAgg2.myPublicKey).toEqual(ourPubKey);
      expect(keyAgg2.myIndex).toEqual(1);
    });

    test('should check hasPublicKey', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();
      const ourPubKey = secp256k1.getPublicKey(ourKey);
      const otherPubKey = secp256k1.getPublicKey(otherKey);
      const unrelatedPubKey = secp256k1.getPublicKey(
        secp256k1.utils.randomPrivateKey(),
      );

      const keyAgg = Musig.create(ourKey, [ourPubKey, otherPubKey]);

      expect(keyAgg.hasPublicKey(ourPubKey)).toEqual(true);
      expect(keyAgg.hasPublicKey(otherPubKey)).toEqual(true);
      expect(keyAgg.hasPublicKey(unrelatedPubKey)).toEqual(false);
    });

    test('should get indexOfPublicKey', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();
      const ourPubKey = secp256k1.getPublicKey(ourKey);
      const otherPubKey = secp256k1.getPublicKey(otherKey);
      const unrelatedPubKey = secp256k1.getPublicKey(
        secp256k1.utils.randomPrivateKey(),
      );

      const keyAgg = Musig.create(ourKey, [ourPubKey, otherPubKey]);

      expect(keyAgg.indexOfPublicKey(ourPubKey)).toEqual(0);
      expect(keyAgg.indexOfPublicKey(otherPubKey)).toEqual(1);
      expect(() => keyAgg.indexOfPublicKey(unrelatedPubKey)).toThrow(
        `could not find index of public key ${hex.encode(unrelatedPubKey)}`,
      );
    });
  });

  describe('MusigWithMessage', () => {
    test('should generate nonce and transition to MusigWithNonce', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, secp256k1.utils.randomPrivateKey()].map(
        (key) => secp256k1.getPublicKey(key),
      );

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(randomBytes(32))
        .generateNonce();

      expect(withNonce).toBeInstanceOf(MusigWithNonce);
      expect(withNonce.publicNonce).toBeDefined();
      expect(withNonce.publicNonce.length).toBeGreaterThan(0);
    });
  });

  describe('MusigWithNonce', () => {
    test('should aggregate ordered nonces', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ];
      const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const nonces = [
        withNonce.publicNonce,
        nonceGen(
          secp256k1.getPublicKey(otherKeys[0]),
          otherKeys[0],
          aggPubkey,
          msg,
        ).public,
        nonceGen(
          secp256k1.getPublicKey(otherKeys[1]),
          otherKeys[1],
          aggPubkey,
          msg,
        ).public,
      ];

      const aggregated = withNonce.aggregateNoncesOrdered(nonces);
      expect(aggregated).toBeInstanceOf(MusigNoncesAggregated);
    });

    test('should not aggregate ordered nonces when length mismatches', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const withNonce = Musig.create(
        ourKey,
        [
          ourKey,
          secp256k1.utils.randomPrivateKey(),
          secp256k1.utils.randomPrivateKey(),
        ].map((key) => secp256k1.getPublicKey(key)),
      )
        .message(randomBytes(32))
        .generateNonce();

      expect(() => withNonce.aggregateNoncesOrdered([])).toThrow(
        'number of nonces != number of public keys',
      );
      expect(() =>
        withNonce.aggregateNoncesOrdered([withNonce.publicNonce]),
      ).toThrow('number of nonces != number of public keys');
      expect(() =>
        withNonce.aggregateNoncesOrdered([
          withNonce.publicNonce,
          withNonce.publicNonce,
          withNonce.publicNonce,
          withNonce.publicNonce,
        ]),
      ).toThrow('number of nonces != number of public keys');
    });

    test('should not aggregate ordered nonces when our nonce is at wrong index', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ];
      const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const nonce1 = nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        aggPubkey,
        msg,
      );
      const nonce2 = nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        aggPubkey,
        msg,
      );

      expect(() =>
        withNonce.aggregateNoncesOrdered([
          nonce1.public,
          withNonce.publicNonce,
          nonce2.public,
        ]),
      ).toThrow('our nonce is at incorrect index');
      expect(() =>
        withNonce.aggregateNoncesOrdered([
          nonce1.public,
          nonce1.public,
          nonce2.public,
        ]),
      ).toThrow('our nonce is at incorrect index');
    });

    test('should aggregate nonces by key', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ];
      const pubKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, pubKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const nonces = new Map([
        [
          pubKeys[1],
          nonceGen(
            secp256k1.getPublicKey(otherKeys[0]),
            otherKeys[0],
            aggPubkey,
            msg,
          ).public,
        ],
        [
          pubKeys[2],
          nonceGen(
            secp256k1.getPublicKey(otherKeys[1]),
            otherKeys[1],
            aggPubkey,
            msg,
          ).public,
        ],
      ]);

      const aggregated = withNonce.aggregateNonces(
        Array.from(nonces.entries()),
      );
      expect(aggregated).toBeInstanceOf(MusigNoncesAggregated);
    });

    test('should not aggregate nonces when size mismatches', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const withNonce = Musig.create(ourKey, [
        secp256k1.getPublicKey(ourKey),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      ])
        .message(randomBytes(32))
        .generateNonce();

      expect(() => withNonce.aggregateNonces([])).toThrow(
        'number of nonces != number of public keys',
      );
    });

    test('should not aggregate nonces when nonce for public key is missing', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, otherKey].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const wrongKey = secp256k1.utils.randomPrivateKey();
      expect(() =>
        withNonce.aggregateNonces([
          [secp256k1.getPublicKey(ourKey), withNonce.publicNonce],
          [
            secp256k1.getPublicKey(wrongKey),
            nonceGen(
              secp256k1.getPublicKey(wrongKey),
              wrongKey,
              withNonce.aggPubkey,
              msg,
            ).public,
          ],
        ]),
      ).toThrow(
        `could not find nonce for public key ${hex.encode(publicKeys[1])}`,
      );
    });

    test('should not aggregate nonces when our nonce does not match', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, otherKey].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const differentNonce = nonceGen(
        secp256k1.getPublicKey(ourKey),
        ourKey,
        aggPubkey,
        randomBytes(32),
      );

      expect(() =>
        withNonce.aggregateNonces([
          [secp256k1.getPublicKey(ourKey), differentNonce.public],
          [
            secp256k1.getPublicKey(otherKey),
            nonceGen(secp256k1.getPublicKey(otherKey), otherKey, aggPubkey, msg)
              .public,
          ],
        ]),
      ).toThrow('nonce for our public key does not match our generated nonce');
    });

    test('should not aggregate nonces when duplicate nonces for same key', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey1 = secp256k1.utils.randomPrivateKey();
      const otherKey2 = secp256k1.utils.randomPrivateKey();
      const publicKeys = [ourKey, otherKey1, otherKey2].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const otherNonce1 = nonceGen(
        secp256k1.getPublicKey(otherKey1),
        otherKey1,
        aggPubkey,
        msg,
      ).public;

      expect(() =>
        withNonce.aggregateNonces([
          [secp256k1.getPublicKey(ourKey), withNonce.publicNonce],
          [secp256k1.getPublicKey(otherKey1), otherNonce1],
          [secp256k1.getPublicKey(otherKey1), otherNonce1],
        ]),
      ).toThrow(
        `duplicate nonce for public key ${hex.encode(secp256k1.getPublicKey(otherKey1))}`,
      );
    });
  });

  describe('MusigNoncesAggregated', () => {
    test('should initialize session', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ];
      const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const nonces = [
        withNonce.publicNonce,
        nonceGen(
          secp256k1.getPublicKey(otherKeys[0]),
          otherKeys[0],
          aggPubkey,
          msg,
        ).public,
        nonceGen(
          secp256k1.getPublicKey(otherKeys[1]),
          otherKeys[1],
          aggPubkey,
          msg,
        ).public,
      ];

      const session = withNonce
        .aggregateNoncesOrdered(nonces)
        .initializeSession();

      expect(session).toBeInstanceOf(MusigSession);
    });
  });

  describe('MusigSession', () => {
    const createSession = () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ];
      const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const otherNonces = otherKeys.map((key) =>
        nonceGen(secp256k1.getPublicKey(key), key, aggPubkey, msg),
      );

      const nonces = [
        withNonce.publicNonce,
        otherNonces[0].public,
        otherNonces[1].public,
      ];

      const session = withNonce
        .aggregateNoncesOrdered(nonces)
        .initializeSession();

      return { session, ourKey, otherKeys, publicKeys, msg, otherNonces };
    };

    test('should create partial signature', () => {
      const { session } = createSession();

      const signed = session.signPartial();

      expect(signed).toBeInstanceOf(MusigSigned);
      expect(signed.ourPartialSignature).toBeDefined();
    });

    test('should verify partial signatures', () => {
      const { session, ourKey } = createSession();

      const signed = session.signPartial();

      // By key
      expect(
        signed.verifyPartial(
          secp256k1.getPublicKey(ourKey),
          signed.ourPartialSignature,
        ),
      ).toEqual(true);

      // By index
      expect(signed.verifyPartial(0, signed.ourPartialSignature)).toEqual(true);
    });

    test('should add partial signatures', () => {
      const { session, otherKeys, otherNonces } = createSession();

      // Get access to the internal session for signing (simulating counterparty)
      const signed = session.signPartial();

      // This is a bit of a workaround to get the internal session
      // In real usage, counterparties would have their own Musig instances
      const internalSession = (
        signed as unknown as {
          state: {
            session: {
              sign: (secret: Uint8Array, key: Uint8Array) => Uint8Array;
            };
          };
        }
      ).state.session;
      const otherSig = internalSession.sign(
        otherNonces[0].secret,
        otherKeys[0],
      );

      // By key
      const withPartial = signed.addPartial(
        secp256k1.getPublicKey(otherKeys[0]),
        otherSig,
      );
      expect(withPartial).toBeInstanceOf(MusigSigned);

      // By index
      const withPartialByIndex = signed.addPartial(1, otherSig);
      expect(withPartialByIndex).toBeInstanceOf(MusigSigned);
    });

    test('should not add invalid partial signatures', () => {
      const { session, ourKey } = createSession();

      const signed = session.signPartial();

      expect(() =>
        signed.addPartial(secp256k1.getPublicKey(ourKey), randomBytes(32)),
      ).toThrow('invalid partial signature');
    });

    test('should add multiple partial signatures with addPartials', () => {
      const { session, otherKeys, otherNonces } = createSession();

      const signed = session.signPartial();

      const internalSession = (
        signed as unknown as {
          state: {
            session: {
              sign: (secret: Uint8Array, key: Uint8Array) => Uint8Array;
            };
          };
        }
      ).state.session;

      const otherSigs = otherKeys.map((key, i) =>
        internalSession.sign(otherNonces[i].secret, key),
      );

      const withPartials = signed.addPartials(
        otherKeys.map((key, i) => [secp256k1.getPublicKey(key), otherSigs[i]]),
      );
      expect(withPartials).toBeInstanceOf(MusigSigned);
    });

    test('should throw when verifyPartial is called with index out of range', () => {
      const { session } = createSession();

      const signed = session.signPartial();

      expect(() =>
        signed.verifyPartial(-1, signed.ourPartialSignature),
      ).toThrow('index out of range');
      expect(() => signed.verifyPartial(3, signed.ourPartialSignature)).toThrow(
        'index out of range',
      );
      expect(() =>
        signed.verifyPartial(1.5, signed.ourPartialSignature),
      ).toThrow('index out of range');
    });

    test('should throw when verifyPartial is called with unknown public key', () => {
      const { session } = createSession();

      const signed = session.signPartial();
      const unknownPubKey = secp256k1.getPublicKey(
        secp256k1.utils.randomPrivateKey(),
      );

      expect(() =>
        signed.verifyPartial(unknownPubKey, signed.ourPartialSignature),
      ).toThrow(
        `could not find index of public key ${hex.encode(unknownPubKey)}`,
      );
    });
  });

  describe('MusigSigned', () => {
    test('should aggregate partial signatures', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();

      const msg = randomBytes(32);
      const publicKeys = [ourKey, otherKey].map((key) =>
        secp256k1.getPublicKey(key),
      );

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const otherNonce = nonceGen(
        secp256k1.getPublicKey(otherKey),
        otherKey,
        aggPubkey,
        msg,
      );

      let signed = withNonce
        .aggregateNoncesOrdered([withNonce.publicNonce, otherNonce.public])
        .initializeSession()
        .signPartial();

      // Get the internal session for counterparty signing
      const internalSession = (
        signed as unknown as {
          state: {
            session: {
              sign: (secret: Uint8Array, key: Uint8Array) => Uint8Array;
            };
          };
        }
      ).state.session;
      const otherSig = internalSession.sign(otherNonce.secret, otherKey);

      signed = signed.addPartial(secp256k1.getPublicKey(otherKey), otherSig);

      const aggregatedSig = signed.aggregatePartials();

      expect(secpZkp.ecc.verifySchnorr(msg, aggPubkey, aggregatedSig)).toEqual(
        true,
      );
    });

    test('should not aggregate partial signatures when not all are set', () => {
      const ourKey = secp256k1.utils.randomPrivateKey();
      const otherKey = secp256k1.utils.randomPrivateKey();

      const publicKeys = [ourKey, otherKey].map((key) =>
        secp256k1.getPublicKey(key),
      );
      const msg = randomBytes(32);

      const withNonce = Musig.create(ourKey, publicKeys)
        .message(msg)
        .generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const otherNonce = nonceGen(
        secp256k1.getPublicKey(otherKey),
        otherKey,
        aggPubkey,
        msg,
      );

      const signed = withNonce
        .aggregateNoncesOrdered([withNonce.publicNonce, otherNonce.public])
        .initializeSession()
        .signPartial();

      expect(() => signed.aggregatePartials()).toThrow(
        'not all partial signatures are set',
      );
    });
  });

  describe('Musig.aggregateKeys', () => {
    test('should aggregate keys matching secp zkp library', async () => {
      const publicKeys = [
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key));

      const aggregated = Musig.aggregateKeys(publicKeys);
      const zkpAggregated = secpZkp.musig.pubkeyAgg(publicKeys);

      expect(aggregated).toEqual(zkpAggregated.aggPubkey);

      const tweak = randomBytes(32);
      const aggregatedWithTweak = Musig.aggregateKeys(publicKeys, tweak);
      const zkpAggregatedWithTweak = secpZkp.musig.pubkeyXonlyTweakAdd(
        zkpAggregated.keyaggCache,
        tweak,
        true,
      );

      expect(aggregatedWithTweak).toEqual(
        toXOnly(zkpAggregatedWithTweak.pubkey),
      );
    });
  });

  describe('Full signing flow', () => {
    const fullExample = (
      count: number,
      toSign: Uint8Array,
      tweak?: Uint8Array,
    ) => {
      const ourKey = secp256k1.utils.randomPrivateKey();

      const counterparties = Array(count)
        .fill(null)
        .map(() => secp256k1.utils.randomPrivateKey());

      const publicKeys = [ourKey, ...counterparties].map((key) =>
        secp256k1.getPublicKey(key),
      );

      let keyAgg = Musig.create(ourKey, publicKeys);
      const untweakedKeyAgg = keyAgg;

      if (tweak) {
        keyAgg = keyAgg.xonlyTweakAdd(tweak);
      }

      const withNonce = keyAgg.message(toSign).generateNonce();

      const aggPubkey = withNonce.aggPubkey;
      const counterpartyNonces = counterparties.map((party) =>
        nonceGen(secp256k1.getPublicKey(party), party, aggPubkey, toSign),
      );

      const aggregated = withNonce.aggregateNonces(
        counterparties.map((party, i) => [
          secp256k1.getPublicKey(party),
          counterpartyNonces[i].public,
        ]),
      );

      let signed = aggregated.initializeSession().signPartial();

      // Get the internal session for counterparty signing
      const internalSession = (
        signed as unknown as {
          state: {
            session: {
              sign: (secret: Uint8Array, key: Uint8Array) => Uint8Array;
            };
          };
        }
      ).state.session;

      counterparties.forEach((party, i) => {
        const sig = internalSession.sign(counterpartyNonces[i].secret, party);
        signed = signed.addPartial(secp256k1.getPublicKey(party), sig);
      });

      return { signed, untweakedKeyAgg };
    };

    test.each`
      count
      ${1}
      ${2}
      ${3}
      ${4}
      ${5}
      ${6}
      ${10}
      ${20}
    `('full example with $count counterparties', ({ count }) => {
      const toSign = randomBytes(32);
      const { signed } = fullExample(count, toSign);

      expect(
        secpZkp.ecc.verifySchnorr(
          toSign,
          signed.aggPubkey,
          signed.aggregatePartials(),
        ),
      ).toEqual(true);
    });

    test.each`
      count
      ${1}
      ${2}
      ${3}
      ${4}
      ${5}
      ${6}
      ${10}
      ${20}
    `('full tweaked example with $count counterparties', ({ count }) => {
      const toSign = randomBytes(32);
      const tweak = randomBytes(32);

      const { signed, untweakedKeyAgg } = fullExample(count, toSign, tweak);

      expect(
        secpZkp.ecc.verifySchnorr(
          toSign,
          secpZkp.ecc.xOnlyPointAddTweak(untweakedKeyAgg.aggPubkey, tweak)!
            .xOnlyPubkey,
          signed.aggregatePartials(),
        ),
      ).toEqual(true);
    });
  });
});
