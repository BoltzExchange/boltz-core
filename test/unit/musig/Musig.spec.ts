import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { nonceGen } from '@scure/btc-signer/musig2.js';
import zkpInit, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { randomBytes } from 'crypto';
import Musig from '../../../lib/musig/Musig';
import { toXOnly } from '../../../lib/swap/TaprootUtils';

describe('Musig', () => {
  let secpZkp: Secp256k1ZKP;

  beforeAll(async () => {
    secpZkp = await zkpInit();
  });

  test('should init', () => {
    const msg = randomBytes(32);
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
    ];

    const publicKeys = [secp256k1.getPublicKey(ourKey), ...otherKeys];
    const musig = new Musig(ourKey, publicKeys, msg);

    expect(musig['myIndex']).toEqual(0);
    expect(
      new Musig(ourKey, [...otherKeys, secp256k1.getPublicKey(ourKey)], msg)[
        'myIndex'
      ],
    ).toEqual(2);
    expect(musig.pubkeyAgg).toBeDefined();
    expect(musig['nonce']).toBeDefined();
    expect(musig['nonce'].public).toBeDefined();
    expect(musig['nonce'].secret).toBeDefined();
    expect(musig['partialSignatures']).toHaveLength(3);
    expect(musig['partialSignatures']).toEqual([null, null, null]);
  });

  test('should not init when our key is not in publicKeys', () => {
    expect(
      () =>
        new Musig(
          secp256k1.utils.randomPrivateKey(),
          [
            secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
            secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
          ],
          randomBytes(32),
        ),
    ).toThrow('our key is not publicKeys');
  });

  test('should not init when less than 2 keys are provided', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();

    expect(() => new Musig(ourKey, [], randomBytes(32))).toThrow(
      'need at least 2 keys to aggregate',
    );
    expect(
      () =>
        new Musig(ourKey, [secp256k1.getPublicKey(ourKey)], randomBytes(32)),
    ).toThrow('need at least 2 keys to aggregate');
  });

  test('should get number of participants', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    expect(
      new Musig(
        ourKey,
        [
          ourKey,
          secp256k1.utils.randomPrivateKey(),
          secp256k1.utils.randomPrivateKey(),
          secp256k1.utils.randomPrivateKey(),
        ].map((key) => secp256k1.getPublicKey(key)),
        randomBytes(32),
      ).numParticipants(),
    ).toEqual(4);
  });

  test('should tweak', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const publicKeys = [
      ourKey,
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ].map((key) => secp256k1.getPublicKey(key));
    const msg = randomBytes(32);

    const musigNoTweak = new Musig(ourKey, publicKeys, msg);
    const tweak = randomBytes(32);
    const musigWithTweak = new Musig(ourKey, publicKeys, msg, tweak);

    // Verify that tweaked pubkey is different from untweaked
    expect(musigWithTweak.pubkeyAgg).not.toEqual(musigNoTweak.pubkeyAgg);

    // Verify that tweaking produces the expected result
    const expectedTweaked = secpZkp.ecc.xOnlyPointAddTweak(
      toXOnly(musigNoTweak.pubkeyAgg),
      tweak,
    );
    expect(expectedTweaked).not.toBeNull();
    expect(musigWithTweak.pubkeyAgg).toEqual(expectedTweaked!.xOnlyPubkey);
  });

  test('should tweak using static method', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const publicKeys = [
      ourKey,
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ].map((key) => secp256k1.getPublicKey(key));
    const msg = randomBytes(32);

    const musigNoTweak = new Musig(ourKey, publicKeys, msg);
    const tweak = randomBytes(32);
    const musigWithTweak = Musig.tweak(musigNoTweak, tweak);

    expect(musigWithTweak.pubkeyAgg).not.toEqual(musigNoTweak.pubkeyAgg);

    const expectedTweaked = secpZkp.ecc.xOnlyPointAddTweak(
      toXOnly(musigNoTweak.pubkeyAgg),
      tweak,
    );
    expect(expectedTweaked).not.toBeNull();
    expect(musigWithTweak.pubkeyAgg).toEqual(expectedTweaked!.xOnlyPubkey);

    expect(musigNoTweak['tweak']).toBeUndefined();
    expect(musigWithTweak['tweak']).toEqual(tweak);
  });

  test('should update message using static method', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const publicKeys = [
      ourKey,
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ].map((key) => secp256k1.getPublicKey(key));
    const msg1 = randomBytes(32);
    const msg2 = randomBytes(32);
    const tweak = randomBytes(32);

    const musigOriginal = new Musig(ourKey, publicKeys, msg1, tweak);
    const musigUpdated = Musig.updateMessage(musigOriginal, msg2);

    expect(musigUpdated.pubkeyAgg).toEqual(musigOriginal.pubkeyAgg);
    expect(musigUpdated.getPublicNonce()).not.toEqual(
      musigOriginal.getPublicNonce(),
    );
    expect(musigUpdated['tweak']).toEqual(tweak);
    expect(musigUpdated['publicKeys']).toEqual(musigOriginal['publicKeys']);
    expect(musigUpdated['partialSignatures']).toEqual([null, null, null]);
  });

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

    expect(aggregatedWithTweak).toEqual(toXOnly(zkpAggregatedWithTweak.pubkey));
  });

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
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonces = [
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ];
    musig.aggregateNoncesOrdered(nonces);

    expect(musig['pubNonces']).toEqual(nonces);
    expect(musig['session']).toBeDefined();
  });

  test('should not aggregate ordered nonces when length mismatches', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [
        ourKey,
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key)),
      randomBytes(32),
    );

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
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonce1 = nonceGen(
      secp256k1.getPublicKey(otherKeys[0]),
      otherKeys[0],
      musig.pubkeyAgg,
      msg,
    );
    const nonce2 = nonceGen(
      secp256k1.getPublicKey(otherKeys[1]),
      otherKeys[1],
      musig.pubkeyAgg,
      msg,
    );

    expect(() =>
      musig.aggregateNoncesOrdered([
        nonce1.public,
        musig.getPublicNonce(),
        nonce2.public,
      ]),
    ).toThrow('our nonce is at incorrect index');
    expect(() =>
      musig.aggregateNoncesOrdered([
        nonce1.public,
        nonce1.public,
        nonce2.public,
      ]),
    ).toThrow('our nonce is at incorrect index');
  });

  test('should aggregate nonces', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const pubKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, pubKeys, msg);

    const nonces = new Map([
      [
        pubKeys[1],
        nonceGen(
          secp256k1.getPublicKey(otherKeys[0]),
          otherKeys[0],
          musig.pubkeyAgg,
          msg,
        ).public,
      ],
      [
        pubKeys[2],
        nonceGen(
          secp256k1.getPublicKey(otherKeys[1]),
          otherKeys[1],
          musig.pubkeyAgg,
          msg,
        ).public,
      ],
    ]);
    musig.aggregateNonces(Array.from(nonces.entries()));

    expect(musig['pubNonces']).toEqual([
      musig.getPublicNonce(),
      nonces.get(pubKeys[1])!,
      nonces.get(pubKeys[2])!,
    ]);
    expect(musig['session']).toBeDefined();
  });

  test('should not aggregate nonces when size mismatches', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [
        secp256k1.getPublicKey(ourKey),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      ],
      randomBytes(32),
    );
    expect(() => musig.aggregateNonces([])).toThrow(
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
    const musig = new Musig(ourKey, publicKeys, msg);

    const wrongKey = secp256k1.utils.randomPrivateKey();
    expect(() =>
      musig.aggregateNonces([
        [secp256k1.getPublicKey(ourKey), musig.getPublicNonce()],
        [
          secp256k1.getPublicKey(wrongKey),
          nonceGen(
            secp256k1.getPublicKey(wrongKey),
            wrongKey,
            musig.pubkeyAgg,
            msg,
          ).public,
        ],
      ]),
    ).toThrow(
      `could not find nonce for public key ${hex.encode(
        musig['publicKeys'][1],
      )}`,
    );
  });

  test('should initialize a session when aggregating nonces', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    expect(musig['session']).not.toBeUndefined();
  });

  test('should not aggregate nonces twice', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonces = [
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ];

    musig.aggregateNoncesOrdered(nonces);
    expect(() => musig.aggregateNoncesOrdered(nonces)).toThrow(
      'nonces already aggregated',
    );
  });

  test('should create partial signatures', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    const sig = musig.signPartial();
    expect(musig['partialSignatures'][0]).toEqual(sig);
  });

  test('should not create partial signatures when session is not initialized', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [
        secp256k1.getPublicKey(ourKey),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
        secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
      ],
      randomBytes(32),
    );

    expect(() => musig.signPartial()).toThrow('session not initialized');
  });

  test('should verify partial signatures', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    const sig = musig.signPartial();

    // By key
    expect(musig.verifyPartial(secp256k1.getPublicKey(ourKey), sig)).toEqual(
      true,
    );

    // By index
    expect(musig.verifyPartial(0, sig)).toEqual(true);
  });

  test('should not verify signatures when public nonces are missing', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [
        ourKey,
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key)),
      randomBytes(32),
    );

    expect(() =>
      musig.verifyPartial(secp256k1.getPublicKey(ourKey), new Uint8Array()),
    ).toThrow('public nonces missing');
  });

  test('should add partial signatures', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKey = secp256k1.utils.randomPrivateKey();
    const thirdKey = secp256k1.utils.randomPrivateKey();

    const publicKeys = [ourKey, otherKey, thirdKey].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const otherNonce = nonceGen(
      secp256k1.getPublicKey(otherKey),
      otherKey,
      musig.pubkeyAgg,
      msg,
    );
    const thirdNonce = nonceGen(
      secp256k1.getPublicKey(thirdKey),
      thirdKey,
      musig.pubkeyAgg,
      msg,
    );

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      otherNonce.public,
      thirdNonce.public,
    ]);

    const sig = musig['session']!.sign(otherNonce.secret, otherKey);

    // By key
    musig.addPartial(secp256k1.getPublicKey(otherKey), sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);

    musig['partialSignatures'][1] = null;

    // By index
    musig.addPartial(1, sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);
  });

  test('should not add invalid partial signatures', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKeys = [
      secp256k1.utils.randomPrivateKey(),
      secp256k1.utils.randomPrivateKey(),
    ];
    const publicKeys = [ourKey, otherKeys[0], otherKeys[1]].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        secp256k1.getPublicKey(otherKeys[0]),
        otherKeys[0],
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        secp256k1.getPublicKey(otherKeys[1]),
        otherKeys[1],
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    expect(() =>
      musig.addPartial(secp256k1.getPublicKey(ourKey), randomBytes(32)),
    ).toThrow('invalid partial signature');
  });

  test('should aggregate partial signatures', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKey = secp256k1.utils.randomPrivateKey();

    const msg = randomBytes(32);
    const musig = new Musig(
      ourKey,
      [ourKey, otherKey].map((key) => secp256k1.getPublicKey(key)),
      msg,
    );

    const otherNonce = nonceGen(
      secp256k1.getPublicKey(otherKey),
      otherKey,
      musig.pubkeyAgg,
      msg,
    );
    musig.aggregateNoncesOrdered([musig.getPublicNonce(), otherNonce.public]);

    musig.signPartial();

    const sig = musig['session']!.sign(otherNonce.secret, otherKey);

    musig.addPartial(secp256k1.getPublicKey(otherKey), sig);

    expect(
      secpZkp.ecc.verifySchnorr(
        msg,
        musig.pubkeyAgg,
        musig.aggregatePartials(),
      ),
    ).toEqual(true);
  });

  test('should not aggregate partial signatures when session is missing', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [
        ourKey,
        secp256k1.utils.randomPrivateKey(),
        secp256k1.utils.randomPrivateKey(),
      ].map((key) => secp256k1.getPublicKey(key)),
      randomBytes(32),
    );

    expect(() => musig.aggregatePartials()).toThrow('session not initialized');
  });

  test('should not aggregate partial signatures when not all are set', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKey = secp256k1.utils.randomPrivateKey();

    const publicKeys = [ourKey, otherKey].map((key) =>
      secp256k1.getPublicKey(key),
    );
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(secp256k1.getPublicKey(otherKey), otherKey, musig.pubkeyAgg, msg)
        .public,
    ]);
    musig.signPartial();

    expect(() => musig.aggregatePartials()).toThrow(
      'not all partial signatures are set',
    );
  });

  test('should find index of keys', () => {
    const ourKey = secp256k1.utils.randomPrivateKey();
    const otherKey = secp256k1.utils.randomPrivateKey();
    const musig = new Musig(
      ourKey,
      [ourKey, otherKey].map((key) => secp256k1.getPublicKey(key)),
      randomBytes(32),
    );

    expect(
      musig['indexOfPublicKeyOrIndex'](secp256k1.getPublicKey(ourKey)),
    ).toEqual(0);
    expect(
      musig['indexOfPublicKeyOrIndex'](secp256k1.getPublicKey(otherKey)),
    ).toEqual(1);

    const randomKey = secp256k1.utils.randomPrivateKey();
    expect(() =>
      musig['indexOfPublicKeyOrIndex'](secp256k1.getPublicKey(randomKey)),
    ).toThrow(
      `could not find index of public key ${hex.encode(
        secp256k1.getPublicKey(randomKey),
      )}`,
    );

    expect(musig['indexOfPublicKeyOrIndex'](0)).toEqual(0);
    expect(musig['indexOfPublicKeyOrIndex'](1)).toEqual(1);
    expect(() => musig['indexOfPublicKeyOrIndex'](123)).toThrow(
      'index out of range',
    );
  });

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
    const musig = new Musig(ourKey, publicKeys, toSign, tweak);

    const counterpartyNonces = counterparties.map((party) =>
      nonceGen(secp256k1.getPublicKey(party), party, musig.pubkeyAgg, toSign),
    );

    musig.aggregateNonces(
      counterparties.map((party, i) => [
        secp256k1.getPublicKey(party),
        counterpartyNonces[i].public,
      ]),
    );

    musig.signPartial();

    counterparties.forEach((party, i) => {
      const sig = musig['session']!.sign(counterpartyNonces[i].secret, party);

      musig.addPartial(secp256k1.getPublicKey(party), sig);
    });

    return { musig, untweakedMusig: new Musig(ourKey, publicKeys, toSign) };
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
    const { musig } = fullExample(count, toSign);

    expect(
      secpZkp.ecc.verifySchnorr(
        toSign,
        musig.pubkeyAgg,
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
    ${10}
    ${20}
  `('full tweaked example with $count counterparties', ({ count }) => {
    const toSign = randomBytes(32);
    const tweak = randomBytes(32);

    const { musig, untweakedMusig } = fullExample(count, toSign, tweak);

    expect(
      secpZkp.ecc.verifySchnorr(
        toSign,
        secpZkp.ecc.xOnlyPointAddTweak(untweakedMusig.pubkeyAgg, tweak)!
          .xOnlyPubkey,
        musig.aggregatePartials(),
      ),
    ).toEqual(true);
  });
});
