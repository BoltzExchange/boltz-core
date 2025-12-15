import { nonceGen } from '@scure/btc-signer/musig2.js';
import zkpInit from '@vulpemventures/secp256k1-zkp';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import Musig from '../../../lib/musig/Musig';
import { ECPair } from '../Utils';

describe('Musig', () => {
  test('should init', () => {
    const msg = randomBytes(32);
    const ourKey = ECPair.makeRandom();
    const otherKeys = [
      ECPair.makeRandom().publicKey,
      ECPair.makeRandom().publicKey,
    ].map(Buffer.from);

    const publicKeys = [Buffer.from(ourKey.publicKey), ...otherKeys];
    const musig = new Musig(ourKey, publicKeys, msg);

    expect(musig['myIndex']).toEqual(0);
    expect(
      new Musig(ourKey, [...otherKeys, Buffer.from(ourKey.publicKey)], msg)[
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
          ECPair.makeRandom(),
          [ECPair.makeRandom().publicKey, ECPair.makeRandom().publicKey].map(
            Buffer.from,
          ),
          randomBytes(32),
        ),
    ).toThrow('our key is not publicKeys');
  });

  test('should not init when key has no private key', () => {
    const publicOnlyKey = ECPair.fromPublicKey(
      Buffer.from(ECPair.makeRandom().publicKey),
    );
    const otherKey = ECPair.makeRandom();

    expect(
      () =>
        new Musig(
          publicOnlyKey,
          [
            Buffer.from(publicOnlyKey.publicKey),
            Buffer.from(otherKey.publicKey),
          ],
          randomBytes(32),
        ),
    ).toThrow('key has no private key');
  });

  test('should not init when less than 2 keys are provided', () => {
    const ourKey = ECPair.makeRandom();

    expect(() => new Musig(ourKey, [], randomBytes(32))).toThrow(
      'need at least 2 keys to aggregate',
    );
    expect(
      () => new Musig(ourKey, [Buffer.from(ourKey.publicKey)], randomBytes(32)),
    ).toThrow('need at least 2 keys to aggregate');
  });

  test('should get number of participants', () => {
    const ourKey = ECPair.makeRandom();
    expect(
      new Musig(
        ourKey,
        [
          Buffer.from(ourKey.publicKey),
          Buffer.from(ECPair.makeRandom().publicKey),
          Buffer.from(ECPair.makeRandom().publicKey),
          Buffer.from(ECPair.makeRandom().publicKey),
        ],
        randomBytes(32),
      ).numParticipants(),
    ).toEqual(4);
  });

  test('should tweak', () => {
    const ourKey = ECPair.makeRandom();
    const publicKeys = [
      Buffer.from(ourKey.publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
    ];
    const msg = randomBytes(32);

    const musigNoTweak = new Musig(ourKey, publicKeys, msg);
    const tweak = randomBytes(32);
    const musigWithTweak = new Musig(ourKey, publicKeys, msg, tweak);

    // Verify that tweaked pubkey is different from untweaked
    expect(Buffer.from(musigWithTweak.pubkeyAgg)).not.toEqual(
      Buffer.from(musigNoTweak.pubkeyAgg),
    );

    // Verify that tweaking produces the expected result
    const expectedTweaked = ecc.xOnlyPointAddTweak(
      toXOnly(Buffer.from(musigNoTweak.pubkeyAgg)),
      tweak,
    );
    expect(expectedTweaked).not.toBeNull();
    expect(Buffer.from(musigWithTweak.pubkeyAgg)).toEqual(
      Buffer.from(expectedTweaked!.xOnlyPubkey),
    );
  });

  test('should tweak using static method', () => {
    const ourKey = ECPair.makeRandom();
    const publicKeys = [
      Buffer.from(ourKey.publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
    ];
    const msg = randomBytes(32);

    const musigNoTweak = new Musig(ourKey, publicKeys, msg);
    const tweak = randomBytes(32);
    const musigWithTweak = Musig.tweak(musigNoTweak, tweak);

    expect(Buffer.from(musigWithTweak.pubkeyAgg)).not.toEqual(
      Buffer.from(musigNoTweak.pubkeyAgg),
    );

    const expectedTweaked = ecc.xOnlyPointAddTweak(
      toXOnly(Buffer.from(musigNoTweak.pubkeyAgg)),
      tweak,
    );
    expect(expectedTweaked).not.toBeNull();
    expect(Buffer.from(musigWithTweak.pubkeyAgg)).toEqual(
      Buffer.from(expectedTweaked!.xOnlyPubkey),
    );

    expect(musigNoTweak['tweak']).toBeUndefined();
    expect(musigWithTweak['tweak']).toEqual(tweak);
  });

  test('should update message using static method', () => {
    const ourKey = ECPair.makeRandom();
    const publicKeys = [
      Buffer.from(ourKey.publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
    ];
    const msg1 = randomBytes(32);
    const msg2 = randomBytes(32);
    const tweak = randomBytes(32);

    const musigOriginal = new Musig(ourKey, publicKeys, msg1, tweak);
    const musigUpdated = Musig.updateMessage(musigOriginal, msg2);

    expect(Buffer.from(musigUpdated.pubkeyAgg)).toEqual(
      Buffer.from(musigOriginal.pubkeyAgg),
    );
    expect(Buffer.from(musigUpdated.getPublicNonce())).not.toEqual(
      Buffer.from(musigOriginal.getPublicNonce()),
    );
    expect(musigUpdated['tweak']).toEqual(tweak);
    expect(musigUpdated['publicKeys']).toEqual(musigOriginal['publicKeys']);
    expect(musigUpdated['partialSignatures']).toEqual([null, null, null]);
  });

  test('should aggregate keys matching secp zkp library', async () => {
    const zkpSecp = await zkpInit();

    const publicKeys = [
      Buffer.from(ECPair.makeRandom().publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
      Buffer.from(ECPair.makeRandom().publicKey),
    ];

    const aggregated = Musig.aggregateKeys(publicKeys);
    const zkpAggregated = zkpSecp.musig.pubkeyAgg(publicKeys);

    expect(Buffer.from(aggregated)).toEqual(
      Buffer.from(zkpAggregated.aggPubkey),
    );

    const tweak = randomBytes(32);
    const aggregatedWithTweak = Musig.aggregateKeys(publicKeys, tweak);
    const zkpAggregatedWithTweak = zkpSecp.musig.pubkeyXonlyTweakAdd(
      zkpAggregated.keyaggCache,
      tweak,
      true,
    );

    expect(Buffer.from(aggregatedWithTweak)).toEqual(
      toXOnly(Buffer.from(zkpAggregatedWithTweak.pubkey)),
    );
  });

  test('should aggregate ordered nonces', () => {
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      Buffer.from(ourKey.publicKey),
      Buffer.from(otherKeys[0].publicKey),
      Buffer.from(otherKeys[1].publicKey),
    ];
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonces = [
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
    ];
    musig.aggregateNoncesOrdered(nonces);

    expect(musig['pubNonces']).toEqual(nonces);
    expect(musig['session']).toBeDefined();
  });

  test('should not aggregate ordered nonces when length mismatches', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [
        Buffer.from(ourKey.publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
        Buffer.from(ECPair.makeRandom().publicKey),
      ],
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
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      Buffer.from(ourKey.publicKey),
      Buffer.from(otherKeys[0].publicKey),
      Buffer.from(otherKeys[1].publicKey),
    ];
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonce1 = nonceGen(
      otherKeys[0].publicKey,
      otherKeys[0].privateKey,
      musig.pubkeyAgg,
      msg,
    );
    const nonce2 = nonceGen(
      otherKeys[1].publicKey,
      otherKeys[1].privateKey,
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
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const pubKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, pubKeys, msg);

    const nonces = new Map([
      [
        pubKeys[1],
        nonceGen(
          otherKeys[0].publicKey,
          otherKeys[0].privateKey,
          musig.pubkeyAgg,
          msg,
        ).public,
      ],
      [
        pubKeys[2],
        nonceGen(
          otherKeys[1].publicKey,
          otherKeys[1].privateKey,
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
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [ourKey.publicKey, ECPair.makeRandom().publicKey].map(Buffer.from),
      randomBytes(32),
    );
    expect(() => musig.aggregateNonces([])).toThrow(
      'number of nonces != number of public keys',
    );
  });

  test('should not aggregate nonces when nonce for public key is missing', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();
    const publicKeys = [ourKey.publicKey, otherKey.publicKey].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const wrongKey = ECPair.makeRandom();
    expect(() =>
      musig.aggregateNonces([
        [ourKey.publicKey, musig.getPublicNonce()],
        [
          wrongKey.publicKey,
          nonceGen(
            wrongKey.publicKey,
            wrongKey.privateKey,
            musig.pubkeyAgg,
            msg,
          ).public,
        ],
      ]),
    ).toThrow(
      `could not find nonce for public key ${Buffer.from(
        musig['publicKeys'][1],
      ).toString('hex')}`,
    );
  });

  test('should initialize a session when aggregating nonces', () => {
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    expect(musig['session']).not.toBeUndefined();
  });

  test('should not aggregate nonces twice', () => {
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const nonces = [
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
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
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    const sig = musig.signPartial();
    expect(musig['partialSignatures'][0]).toEqual(sig);
  });

  test('should not create partial signatures when session is not initialized', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [
        ourKey.publicKey,
        ECPair.makeRandom().publicKey,
        ECPair.makeRandom().publicKey,
      ].map(Buffer.from),
      randomBytes(32),
    );

    expect(() => musig.signPartial()).toThrow('session not initialized');
  });

  test('should verify partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    const sig = musig.signPartial();

    // By key
    expect(musig.verifyPartial(Buffer.from(ourKey.publicKey), sig)).toEqual(
      true,
    );

    // By index
    expect(musig.verifyPartial(0, sig)).toEqual(true);
  });

  test('should not verify signatures when public nonces are missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [
        ourKey.publicKey,
        ECPair.makeRandom().publicKey,
        ECPair.makeRandom().publicKey,
      ].map(Buffer.from),
      randomBytes(32),
    );

    expect(() =>
      musig.verifyPartial(Buffer.from(ourKey.publicKey), new Uint8Array()),
    ).toThrow('public nonces missing');
  });

  test('should add partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();
    const thirdKey = ECPair.makeRandom();

    const publicKeys = [
      ourKey.publicKey,
      otherKey.publicKey,
      thirdKey.publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    const otherNonce = nonceGen(
      otherKey.publicKey,
      otherKey.privateKey,
      musig.pubkeyAgg,
      msg,
    );
    const thirdNonce = nonceGen(
      thirdKey.publicKey,
      thirdKey.privateKey,
      musig.pubkeyAgg,
      msg,
    );

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      otherNonce.public,
      thirdNonce.public,
    ]);

    const sig = musig['session']!.sign(otherNonce.secret, otherKey.privateKey!);

    // By key
    musig.addPartial(Buffer.from(otherKey.publicKey), sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);

    musig['partialSignatures'][1] = null;

    // By index
    musig.addPartial(1, sig);
    expect(musig['partialSignatures'][1]).toEqual(sig);
  });

  test('should not add invalid partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKeys = [ECPair.makeRandom(), ECPair.makeRandom()];
    const publicKeys = [
      ourKey.publicKey,
      otherKeys[0].publicKey,
      otherKeys[1].publicKey,
    ].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(
        otherKeys[0].publicKey,
        otherKeys[0].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
      nonceGen(
        otherKeys[1].publicKey,
        otherKeys[1].privateKey,
        musig.pubkeyAgg,
        msg,
      ).public,
    ]);

    expect(() =>
      musig.addPartial(Buffer.from(ourKey.publicKey), randomBytes(32)),
    ).toThrow('invalid partial signature');
  });

  test('should aggregate partial signatures', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();

    const msg = randomBytes(32);
    const musig = new Musig(
      ourKey,
      [ourKey.publicKey, otherKey.publicKey].map(Buffer.from),
      msg,
    );

    const otherNonce = nonceGen(
      otherKey.publicKey,
      otherKey.privateKey,
      musig.pubkeyAgg,
      msg,
    );
    musig.aggregateNoncesOrdered([musig.getPublicNonce(), otherNonce.public]);

    musig.signPartial();

    const sig = musig['session']!.sign(otherNonce.secret, otherKey.privateKey!);

    musig.addPartial(Buffer.from(otherKey.publicKey), sig);

    expect(
      ecc.verifySchnorr(msg, musig.pubkeyAgg, musig.aggregatePartials()),
    ).toEqual(true);
  });

  test('should not aggregate partial signatures when session is missing', () => {
    const ourKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [
        ourKey.publicKey,
        ECPair.makeRandom().publicKey,
        ECPair.makeRandom().publicKey,
      ].map(Buffer.from),
      randomBytes(32),
    );

    expect(() => musig.aggregatePartials()).toThrow('session not initialized');
  });

  test('should not aggregate partial signatures when not all are set', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();

    const publicKeys = [ourKey.publicKey, otherKey.publicKey].map(Buffer.from);
    const msg = randomBytes(32);
    const musig = new Musig(ourKey, publicKeys, msg);

    musig.aggregateNoncesOrdered([
      musig.getPublicNonce(),
      nonceGen(otherKey.publicKey, otherKey.privateKey, musig.pubkeyAgg, msg)
        .public,
    ]);
    musig.signPartial();

    expect(() => musig.aggregatePartials()).toThrow(
      'not all partial signatures are set',
    );
  });

  test('should find index of keys', () => {
    const ourKey = ECPair.makeRandom();
    const otherKey = ECPair.makeRandom();
    const musig = new Musig(
      ourKey,
      [ourKey.publicKey, otherKey.publicKey].map(Buffer.from),
      randomBytes(32),
    );

    expect(
      musig['indexOfPublicKeyOrIndex'](Buffer.from(ourKey.publicKey)),
    ).toEqual(0);
    expect(
      musig['indexOfPublicKeyOrIndex'](Buffer.from(otherKey.publicKey)),
    ).toEqual(1);

    const randomKey = ECPair.makeRandom();
    expect(() =>
      musig['indexOfPublicKeyOrIndex'](Buffer.from(randomKey.publicKey)),
    ).toThrow(
      `could not find index of public key ${Buffer.from(randomKey.publicKey).toString('hex')}`,
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
      .map(() => ECPair.makeRandom());

    const publicKeys = [ourKey, ...counterparties]
      .map((key) => key.publicKey)
      .map(Buffer.from);
    const musig = new Musig(ourKey, publicKeys, toSign, tweak);

    const counterpartyNonces = counterparties.map((party) =>
      nonceGen(party.publicKey, party.privateKey, musig.pubkeyAgg, toSign),
    );

    musig.aggregateNonces(
      counterparties.map((party, i) => [
        party.publicKey,
        counterpartyNonces[i].public,
      ]),
    );

    musig.signPartial();

    counterparties.forEach((party, i) => {
      const sig = musig['session']!.sign(
        counterpartyNonces[i].secret,
        party.privateKey!,
      );

      musig.addPartial(Buffer.from(party.publicKey), sig);
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
      ecc.verifySchnorr(toSign, musig.pubkeyAgg, musig.aggregatePartials()),
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
      ecc.verifySchnorr(
        toSign,
        ecc.xOnlyPointAddTweak(untweakedMusig.pubkeyAgg, tweak)!.xOnlyPubkey,
        musig.aggregatePartials(),
      ),
    ).toEqual(true);
  });
});
