import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hex } from '@scure/base';
import {
  type Nonces,
  Session,
  keyAggExport,
  keyAggregate,
  nonceAggregate,
  nonceGen,
} from '@scure/btc-signer/musig2.js';
import { equalBytes } from '@scure/btc-signer/utils.js';

type PublicKey = Uint8Array;
type PrivateKey = Uint8Array;
type NonceBytes = Uint8Array;
type PartialSignature = Uint8Array;

type ParticipantIndex = number & { readonly __brand: unique symbol };
type NoncePair = readonly [PublicKey, NonceBytes];

interface BaseState {
  readonly privateKey: PrivateKey;
  readonly myPublicKey: PublicKey;

  readonly publicKeys: ReadonlyArray<PublicKey>;
  readonly myIndex: ParticipantIndex;

  readonly aggPubkey: PublicKey;
  readonly internalKey: PublicKey;

  readonly tweak?: Uint8Array;
}

interface StateWithMessage extends BaseState {
  readonly msg: Uint8Array;
}

interface StateWithNonce extends StateWithMessage {
  readonly nonce: Nonces;
}

interface StateWithAggregatedNonces extends StateWithNonce {
  readonly pubNonces: ReadonlyArray<NonceBytes>;
  readonly aggregatedNonce: NonceBytes;
}

interface StateWithSession extends StateWithAggregatedNonces {
  readonly session: Session;
  readonly partialSignatures: Array<PartialSignature | null>;
}

interface StateWithSignature extends StateWithSession {
  readonly ourSignature: PartialSignature;
}

const assertParticipantIndex = (
  index: number,
  length: number,
): ParticipantIndex => {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error('index out of range');
  }

  return index as ParticipantIndex;
};

const assertUniquePublicKeys = (publicKeys: ReadonlyArray<PublicKey>): void => {
  const seen = new Set<string>();
  for (const key of publicKeys) {
    const encoded = hex.encode(key);
    if (seen.has(encoded)) {
      throw new Error(`duplicate public key ${encoded}`);
    }
    seen.add(encoded);
  }
};

const assertPublicKeyLength33 = (publicKey: PublicKey): void => {
  if (publicKey.length !== 33) {
    throw new Error(`public key must be 33 bytes, got ${publicKey.length}`);
  }
};

const assertPublicKeys = (publicKeys: ReadonlyArray<PublicKey>): void => {
  for (const publicKey of publicKeys) {
    assertPublicKeyLength33(publicKey);
  }
  assertUniquePublicKeys(publicKeys);
};

const normalizePublicKeys = (
  publicKeys: ReadonlyArray<PublicKey>,
): ReadonlyArray<PublicKey> => {
  const keys = [...publicKeys];
  assertPublicKeys(keys);
  return Object.freeze(keys);
};

const allPartialsPresent = (
  partials: Array<PartialSignature | null>,
): partials is Array<PartialSignature> =>
  partials.every((partial): partial is PartialSignature => partial !== null);

const findKeyIndex = (
  publicKeys: ReadonlyArray<PublicKey>,
  targetKey: PublicKey,
): number => publicKeys.findIndex((key) => equalBytes(targetKey, key));

const indexOfPublicKeyOrIndex = (
  publicKeys: ReadonlyArray<PublicKey>,
  publicKeyOrIndex: PublicKey | number,
): ParticipantIndex => {
  if (typeof publicKeyOrIndex === 'number') {
    return assertParticipantIndex(publicKeyOrIndex, publicKeys.length);
  }

  const index = findKeyIndex(publicKeys, publicKeyOrIndex);
  if (index === -1) {
    throw new Error(
      `could not find index of public key ${hex.encode(publicKeyOrIndex)}`,
    );
  }

  return assertParticipantIndex(index, publicKeys.length);
};

abstract class MusigBase<S extends BaseState> {
  constructor(protected readonly state: S) {}

  public get aggPubkey(): PublicKey {
    return this.state.aggPubkey;
  }

  public get internalKey(): PublicKey {
    return this.state.internalKey;
  }

  public get publicKeys(): ReadonlyArray<PublicKey> {
    return this.state.publicKeys;
  }

  public get myPublicKey(): PublicKey {
    return this.state.myPublicKey;
  }

  public get myIndex(): ParticipantIndex {
    return this.state.myIndex;
  }

  public get tweak(): Uint8Array | undefined {
    return this.state.tweak;
  }

  public get numParticipants(): number {
    return this.state.publicKeys.length;
  }

  public hasPublicKey = (publicKey: PublicKey): boolean => {
    return findKeyIndex(this.state.publicKeys, publicKey) !== -1;
  };

  public indexOfPublicKey = (publicKey: PublicKey): ParticipantIndex => {
    return indexOfPublicKeyOrIndex(this.state.publicKeys, publicKey);
  };
}

abstract class MusigWithMessageBase<
  S extends StateWithMessage,
> extends MusigBase<S> {
  public get msg(): Uint8Array {
    return this.state.msg;
  }
}

abstract class MusigWithNonceBase<
  S extends StateWithNonce,
> extends MusigWithMessageBase<S> {
  public get publicNonce(): NonceBytes {
    return this.state.nonce.public;
  }
}

abstract class MusigWithSessionBase<
  S extends StateWithSession,
> extends MusigWithNonceBase<S> {
  public verifyPartial = (
    publicKeyOrIndex: PublicKey | number,
    signature: PartialSignature,
  ): boolean => {
    const index = indexOfPublicKeyOrIndex(
      this.state.publicKeys,
      publicKeyOrIndex,
    );

    return this.state.session.partialSigVerify(
      signature,
      Array.from(this.state.pubNonces),
      index,
    );
  };

  public addPartial = (
    publicKeyOrIndex: PublicKey | number,
    signature: PartialSignature,
  ): this => {
    if (!this.verifyPartial(publicKeyOrIndex, signature)) {
      throw new Error('invalid partial signature');
    }

    const index = indexOfPublicKeyOrIndex(
      this.state.publicKeys,
      publicKeyOrIndex,
    );
    this.state.partialSignatures[index] = signature;

    return this;
  };

  public addPartials = (
    partials: Iterable<readonly [PublicKey | number, PartialSignature]>,
  ): this => {
    for (const [publicKeyOrIndex, signature] of partials) {
      this.addPartial(publicKeyOrIndex, signature);
    }
    return this;
  };
}

abstract class MusigWithOurPartialSignatureBase<
  S extends StateWithSignature,
> extends MusigWithSessionBase<S> {
  public get ourPartialSignature(): PartialSignature {
    return this.state.ourSignature;
  }
}

class MusigKeyAgg extends MusigBase<BaseState> {
  public xonlyTweakAdd = (tweak: Uint8Array): MusigKeyAgg => {
    if (this.state.tweak) {
      throw new Error('musig key already tweaked');
    }
    return new MusigKeyAgg({
      ...this.state,
      aggPubkey: aggregateKeys(this.state.publicKeys, tweak),
      tweak,
    });
  };

  public message = (msg: Uint8Array): MusigWithMessage => {
    return new MusigWithMessage({ ...this.state, msg });
  };
}

class MusigWithMessage extends MusigWithMessageBase<StateWithMessage> {
  public generateNonce = (): MusigWithNonce => {
    const nonce = nonceGen(
      this.state.myPublicKey,
      this.state.privateKey,
      this.state.aggPubkey,
      this.state.msg,
    );
    return new MusigWithNonce({ ...this.state, nonce });
  };
}

class MusigWithNonce extends MusigWithNonceBase<StateWithNonce> {
  public aggregateNonces = (
    nonces: Iterable<NoncePair>,
  ): MusigNoncesAggregated => {
    const noncesToUse = Array.from(nonces);
    const ourNonceEntry = noncesToUse.find(([keyCmp]) =>
      equalBytes(this.state.myPublicKey, keyCmp),
    );

    if (ourNonceEntry === undefined) {
      noncesToUse.push([this.state.myPublicKey, this.publicNonce]);
    } else if (!equalBytes(ourNonceEntry[1], this.publicNonce)) {
      throw new Error(
        'nonce for our public key does not match our generated nonce',
      );
    }

    if (this.state.publicKeys.length !== noncesToUse.length) {
      throw new Error('number of nonces != number of public keys');
    }

    const nonceByKey = new Map<string, Uint8Array>();
    for (const [key, nonce] of noncesToUse) {
      const encoded = hex.encode(key);
      if (nonceByKey.has(encoded)) {
        throw new Error(`duplicate nonce for public key ${encoded}`);
      }
      nonceByKey.set(encoded, nonce);
    }

    const ordered: Uint8Array[] = [];
    for (const key of this.state.publicKeys) {
      const nonce = nonceByKey.get(hex.encode(key));
      if (nonce === undefined) {
        throw new Error(
          `could not find nonce for public key ${hex.encode(key)}`,
        );
      }
      ordered.push(nonce);
    }

    return this.aggregateNoncesOrdered(ordered);
  };

  public aggregateNoncesOrdered = (
    nonces: ReadonlyArray<NonceBytes>,
  ): MusigNoncesAggregated => {
    if (this.state.publicKeys.length !== nonces.length) {
      throw new Error('number of nonces != number of public keys');
    }

    if (!equalBytes(nonces[this.state.myIndex], this.state.nonce.public)) {
      throw new Error('our nonce is at incorrect index');
    }

    const orderedNonces = Object.freeze([...nonces]);

    return new MusigNoncesAggregated({
      ...this.state,
      pubNonces: orderedNonces,
      aggregatedNonce: nonceAggregate([...orderedNonces]),
    });
  };
}

class MusigNoncesAggregated extends MusigWithNonceBase<StateWithAggregatedNonces> {
  public initializeSession = (): MusigSession => {
    const session = new Session(
      this.state.aggregatedNonce,
      Array.from(this.state.publicKeys),
      this.state.msg,
      this.state.tweak ? [this.state.tweak] : [],
      this.state.tweak ? [true] : [],
    );

    return new MusigSession({
      ...this.state,
      session,
      partialSignatures: Array(this.state.publicKeys.length).fill(null),
    });
  };
}

class MusigSession extends MusigWithSessionBase<StateWithSession> {
  public signPartial = (): MusigSigned => {
    const sig = this.state.session.sign(
      this.state.nonce.secret,
      this.state.privateKey,
      true,
    );

    const partialSignatures = [...this.state.partialSignatures];
    partialSignatures[this.state.myIndex] = sig;

    return new MusigSigned({
      ...this.state,
      partialSignatures,
      ourSignature: sig,
    });
  };
}

class MusigSigned extends MusigWithOurPartialSignatureBase<StateWithSignature> {
  public aggregatePartials = (): Uint8Array => {
    if (!allPartialsPresent(this.state.partialSignatures)) {
      throw new Error('not all partial signatures are set');
    }

    return this.state.session.partialSigAgg(this.state.partialSignatures);
  };
}

const aggregateKeys = (
  publicKeys: ReadonlyArray<PublicKey>,
  tweak?: Uint8Array,
): Uint8Array => {
  assertPublicKeys(publicKeys);
  return keyAggExport(
    keyAggregate([...publicKeys], tweak ? [tweak] : [], tweak ? [true] : []),
  );
};

const create = (
  privateKey: PrivateKey,
  publicKeys: ReadonlyArray<PublicKey>,
): MusigKeyAgg => {
  if (publicKeys.length < 2) {
    throw new Error('need at least 2 keys to aggregate');
  }

  const normalizedPublicKeys = normalizePublicKeys(publicKeys);
  const myPublicKey = secp256k1.getPublicKey(privateKey);
  const myIndex = findKeyIndex(normalizedPublicKeys, myPublicKey);

  if (myIndex === -1) {
    throw new Error('our key is not in publicKeys');
  }

  const aggPubkey = aggregateKeys(normalizedPublicKeys);

  return new MusigKeyAgg({
    privateKey,
    myPublicKey,
    publicKeys: normalizedPublicKeys,
    myIndex: assertParticipantIndex(myIndex, normalizedPublicKeys.length),
    aggPubkey,
    internalKey: aggPubkey,
  });
};

export {
  aggregateKeys,
  create,
  MusigKeyAgg,
  MusigWithMessage,
  MusigWithNonce,
  MusigNoncesAggregated,
  MusigSession,
  MusigSigned,
  type NoncePair,
  type ParticipantIndex,
};
