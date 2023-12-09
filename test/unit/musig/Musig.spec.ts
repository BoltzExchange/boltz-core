import { randomBytes } from 'crypto';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import zkp, { Secp256k1ZKP } from '@michael1011/secp256k1-zkp';
import { ECPair } from '../Utils';
import Musig from '../../../lib/musig/Musig';

describe('Musig', () => {
  let secp: Secp256k1ZKP;

  beforeAll(async () => {
    secp = await zkp();
  });

  test('should init', () => {
    const sessionId = randomBytes(32);
    const ourKey = ECPair.makeRandom();
    const otherKeys = [
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ];

    const publicKeys = [ourKey.publicKey, ...otherKeys];
    const musig = new Musig(secp, ourKey, sessionId, publicKeys);

    expect(musig['myIndex']).toEqual(0);
    expect(
      new Musig(secp, ourKey, sessionId, [...otherKeys, ourKey.publicKey])[
        'myIndex'
      ],
    ).toEqual(2);
    expect(musig['pubkeyAgg']).toEqual(
      secp.musig.pubkeyAgg([ourKey.publicKey, ...otherKeys].map(toXOnly)),
    );
    expect(musig['nonce']).toEqual(secp.musig.nonceGen(sessionId));
    expect(musig['partialSignatures']).toHaveLength(3);
    expect(musig['partialSignatures']).toEqual([null, null, null]);
  });

  test('should not init when our key is not in publicKeys', () => {
    expect(
      () =>
        new Musig(secp, ECPair.makeRandom(), randomBytes(32), [
          ECPair.makeRandom().publicKey,
          ECPair.makeRandom().publicKey,
        ]),
    ).toThrow('our key is not publicKeys');
  });

  test('should not init when less than 2 keys are provided', () => {
    const ourKey = ECPair.makeRandom();

    expect(() => new Musig(secp, ourKey, randomBytes(32), [])).toThrow(
      'need at least 2 keys to aggregate',
    );
    expect(
      () => new Musig(secp, ourKey, randomBytes(32), [ourKey.publicKey]),
    ).toThrow('need at least 2 keys to aggregate');
  });

  test('should get number of participants', () => {
    const ourKey = ECPair.makeRandom();
    expect(
      new Musig(secp, ourKey, randomBytes(32), [
        ourKey.publicKey,
        ECPair.makeRandom().publicKey,
        ECPair.makeRandom().publicKey,
        ECPair.makeRandom().publicKey,
      ]).numParticipants(),
    ).toEqual(4);
  });

  test('should tweak', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    const tweak = randomBytes(32);
    const tweakedKey = musig.tweakKey(tweak);

    expect(toXOnly(tweakedKey)).toEqual(
      Buffer.from(
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(musig.getAggregatedPublicKey()),
          tweak,
        )!.xOnlyPubkey,
      ),
    );
  });

  test('should aggregate ordered nonces', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    const nonces = [
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ];
    musig.aggregateNoncesOrdered(nonces);

    expect(musig['pubNonces']).toEqual(nonces);
    expect(musig['nonceAgg']).toEqual(secp.musig.nonceAgg(nonces));
  });

  test('should not aggregate ordered nonces when length mismatches', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() => musig.aggregateNoncesOrdered([])).toThrow(
      'number of nonces != number of public keys',
    );
    expect(() =>
      musig.aggregateNoncesOrdered([musig.getPublicNonce()]),
    ).toThrow('number of nonces != number of public keys');
    expect(() =>
      musig.aggregateNoncesOrdered([
        musig.getPublicNonce(),
        musig.getPublicNonce(),
        musig.getPublicNonce(),
        musig.getPublicNonce(),
      ]),
    ).toThrow('number of nonces != number of public keys');
  });

  test('should not aggregate ordered nonces when our nonce is at wrong index', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() =>
      musig.aggregateNoncesOrdered([
        secp.musig.nonceGen(randomBytes(32)).pubNonce,
        musig.getPublicNonce(),
        secp.musig.nonceGen(randomBytes(32)).pubNonce,
      ]),
    ).toThrow('our nonce is at incorrect index');
    expect(() =>
      musig.aggregateNoncesOrdered([
        secp.musig.nonceGen(randomBytes(32)).pubNonce,
        secp.musig.nonceGen(randomBytes(32)).pubNonce,
        secp.musig.nonceGen(randomBytes(32)).pubNonce,
      ]),
    ).toThrow('our nonce is at incorrect index');
  });

  test('should aggregate nonces', () => {
    const ourKey = ECPair.makeRandom();
    const pubKeys = [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ];
    const musig = new Musig(secp, ourKey, randomBytes(32), pubKeys);

    const nonces = new Map([
      [pubKeys[1], secp.musig.nonceGen(randomBytes(32)).pubNonce],
      [pubKeys[2], secp.musig.nonceGen(randomBytes(32)).pubNonce],
    ]);
    musig.aggregateNonces(nonces);

    expect(musig['pubNonces']).toEqual([
      musig.getPublicNonce(),
      nonces.get(pubKeys[1])!,
      nonces.get(pubKeys[2])!,
    ]);
    expect(musig['nonceAgg']).toEqual(
      secp.musig.nonceAgg([
        musig.getPublicNonce(),
        nonces.get(pubKeys[1])!,
        nonces.get(pubKeys[2])!,
      ]),
    );
  });

  test('should not aggregate nonces when size mismatches', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
    ]);
    expect(() => musig.aggregateNonces(new Map())).toThrow(
      'number of nonces != number of public keys',
    );
  });

  test('should not aggregate nonces when nonce for public key is missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() =>
      musig.aggregateNonces(
        new Map([
          [ourKey.publicKey, musig.getPublicNonce()],
          [
            ECPair.makeRandom().publicKey,
            secp.musig.nonceGen(randomBytes(32)).pubNonce,
          ],
        ]),
      ),
    ).toThrow(
      `could not find nonce for public key ${Buffer.from(
        musig['publicKeys'][1],
      ).toString('hex')}`,
    );
  });

  test('should initialize a session', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);
    musig.initializeSession(randomBytes(32));

    expect(musig['session']).not.toBeUndefined();
  });

  test('should not initialize session when nonce aggregate is missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() => musig.initializeSession(randomBytes(32))).toThrow(
      'nonces not aggregated',
    );
  });

  test('should not initialize a session twice', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    musig.initializeSession(randomBytes(32));
    expect(() => musig.initializeSession(randomBytes(32))).toThrow(
      'session already initialized',
    );
  });

  test('should create partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    musig.initializeSession(randomBytes(32));

    const sig = musig.signPartial();
    expect(musig['partialSignatures'][0]).toEqual(sig);
  });

  test('should not create partial signatures when session is not initialized', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() => musig.signPartial()).toThrow('session not initialized');
  });

  test('should verify partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    musig.initializeSession(randomBytes(32));

    // By key
    expect(musig.verifyPartial(ourKey.publicKey, musig.signPartial())).toEqual(
      true,
    );

    // By index
    expect(musig.verifyPartial(0, musig.signPartial())).toEqual(true);
  });

  test('should not verify signatures when public nonces are missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() =>
      musig.verifyPartial(ourKey.publicKey, new Uint8Array()),
    ).toThrow('public nonces missing');
  });

  test('should not verify signatures session is missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);
    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    expect(() =>
      musig.verifyPartial(ourKey.publicKey, new Uint8Array()),
    ).toThrow('session not initialized');
  });

  test('should add partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();

    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      otherKey.publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    const otherNonce = secp.musig.nonceGen(randomBytes(32));
    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      otherNonce.pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    musig.initializeSession(randomBytes(32));

    const sig = secp.musig.partialSign(
      otherNonce.secNonce,
      otherKey.privateKey!,
      musig['pubkeyAgg'].keyaggCache,
      musig['session']!,
    );

    // By key
    musig.addPartial(otherKey.publicKey, sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);

    musig['partialSignatures'][1] = null;

    // By index
    musig.addPartial(1, sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);
  });

  test('should not add invalid partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);

    musig.initializeSession(randomBytes(32));
    expect(() => musig.addPartial(ourKey.publicKey, new Uint8Array())).toThrow(
      'invalid partial signature',
    );
  });

  test('should aggregate partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();

    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      otherKey.publicKey,
    ]);

    const otherNonce = secp.musig.nonceGen(randomBytes(32));
    musig.aggregateNoncesOrdered([musig.getPublicNonce(), otherNonce.pubNonce]);

    const msg = randomBytes(32);
    musig.initializeSession(msg);
    musig.signPartial();

    const sig = secp.musig.partialSign(
      otherNonce.secNonce,
      otherKey.privateKey!,
      musig['pubkeyAgg'].keyaggCache,
      musig['session']!,
    );

    musig.addPartial(otherKey.publicKey, sig);

    expect(
      secp.ecc.verifySchnorr(
        msg,
        musig.getAggregatedPublicKey(),
        musig.aggregatePartials(),
      ),
    ).toEqual(true);
  });

  test('should not aggregate partial signatures when session is missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    expect(() => musig.aggregatePartials()).toThrow('session not initialized');
  });

  test('should not aggregate partial signatures when not all are set', () => {
    const ourKey = ECPair.makeRandom();

    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      ECPair.makeRandom().publicKey,
    ]);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      secp.musig.nonceGen(randomBytes(32)).pubNonce,
    ]);
    musig.initializeSession(randomBytes(32));
    musig.signPartial();

    expect(() => musig.aggregatePartials()).toThrow(
      'not all partial signatures are set',
    );
  });

  test('should find index of keys', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();
    const musig = new Musig(secp, ourKey, randomBytes(32), [
      ourKey.publicKey,
      otherKey.publicKey,
    ]);

    expect(musig['indexOfPublicKeyOrIndex'](ourKey.publicKey)).toEqual(0);
    expect(musig['indexOfPublicKeyOrIndex'](otherKey.publicKey)).toEqual(1);

    const randomKey = ECPair.makeRandom();
    expect(() => musig['indexOfPublicKeyOrIndex'](randomKey.publicKey)).toThrow(
      `could not find index of public key ${randomKey.publicKey.toString(
        'hex',
      )}`,
    );

    expect(musig['indexOfPublicKeyOrIndex'](0)).toEqual(0);
    expect(musig['indexOfPublicKeyOrIndex'](1)).toEqual(1);
    expect(() => musig['indexOfPublicKeyOrIndex'](123)).toThrow(
      'index out of range',
    );
  });

  const fullExample = (count: number, toSign: Buffer, tweak?: Buffer) => {
    const ourKey = ECPair.makeRandom();

    const counterparties = Array(count)
      .fill(null)
      .map(() => ({
        key: ECPair.makeRandom(),
        nonce: secp.musig.nonceGen(randomBytes(32)),
      }));

    const publicKeys = [
      ourKey,
      ...counterparties.map((party) => party.key),
    ].map((key) => key.publicKey);
    const musig = new Musig(secp, ourKey, randomBytes(32), publicKeys);

    if (tweak) {
      musig.tweakKey(tweak);
    }

    musig.aggregateNonces(
      new Map<Uint8Array, Uint8Array>(
        counterparties.map((party) => [
          party.key.publicKey,
          party.nonce.pubNonce,
        ]),
      ),
    );

    musig.initializeSession(toSign);
    musig.signPartial();

    counterparties.forEach((party) => {
      const pubkeyAgg = secp.musig.pubkeyAgg(publicKeys.map(toXOnly));

      if (tweak) {
        pubkeyAgg.keyaggCache = secp.musig.pubkeyXonlyTweakAdd(
          pubkeyAgg.keyaggCache,
          tweak,
          true,
        ).keyaggCache;
      }

      const session = secp.musig.nonceProcess(
        secp.musig.nonceAgg([
          musig.getPublicNonce(),
          ...counterparties.map((party) => party.nonce.pubNonce),
        ]),
        toSign,
        pubkeyAgg.keyaggCache,
      );

      musig.addPartial(
        party.key.publicKey,
        secp.musig.partialSign(
          party.nonce.secNonce,
          party.key.privateKey!,
          pubkeyAgg.keyaggCache,
          session,
        ),
      );
    });

    return musig;
  };

  test.each`
    count
    ${1}
    ${2}
    ${3}
    ${4}
    ${5}
    ${6}
  `('full example with $count counterparties', ({ count }) => {
    const toSign = randomBytes(32);
    const musig = fullExample(count, toSign);

    expect(
      secp.ecc.verifySchnorr(
        toSign,
        musig.getAggregatedPublicKey(),
        musig.aggregatePartials(),
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
  `('full tweaked example with $count counterparties', ({ count }) => {
    const toSign = randomBytes(32);
    const tweak = randomBytes(32);

    const musig = fullExample(count, toSign, tweak);

    expect(
      secp.ecc.verifySchnorr(
        toSign,
        secp.ecc.xOnlyPointAddTweak(
          toXOnly(musig.getAggregatedPublicKey()),
          tweak,
        )!.xOnlyPubkey,
        musig.aggregatePartials(),
      ),
    ).toEqual(true);
  });
});
