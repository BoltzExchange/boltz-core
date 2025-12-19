import {
  type Nonces,
  Session,
  keyAggExport,
  keyAggregate,
  nonceAggregate,
  nonceGen,
} from '@scure/btc-signer/musig2.js';
import type { ECPairInterface } from 'ecpair';
import { uint8ArrayEqual, uint8ArrayToHex } from '../Utils';

class Musig {
  public readonly pubkeyAgg: Uint8Array;
  public readonly internalKey: Uint8Array;

  private readonly nonce: Nonces;

  private readonly myIndex: number;
  private readonly partialSignatures: (Uint8Array | null)[];

  private pubNonces?: Uint8Array[];

  private session?: Session;

  constructor(
    private readonly key: ECPairInterface,
    public readonly publicKeys: Uint8Array[],
    public readonly msg: Uint8Array,
    public readonly tweak?: Uint8Array,
  ) {
    if (key.privateKey === undefined) {
      throw new Error('key has no private key');
    }

    if (publicKeys.length < 2) {
      throw new Error('need at least 2 keys to aggregate');
    }

    this.myIndex = this.publicKeys.findIndex((key) =>
      uint8ArrayEqual(this.key.publicKey, key),
    );

    if (this.myIndex === -1) {
      throw new Error('our key is not publicKeys');
    }

    this.pubkeyAgg = Musig.aggregateKeys(publicKeys, tweak);
    this.internalKey =
      tweak !== undefined ? Musig.aggregateKeys(publicKeys) : this.pubkeyAgg;
    this.nonce = nonceGen(
      this.key.publicKey,
      this.key.privateKey,
      this.pubkeyAgg,
      this.msg,
    );
    this.partialSignatures = Array(publicKeys.length).fill(null);
  }

  public static aggregateKeys = (
    publicKeys: Uint8Array[],
    tweak?: Uint8Array,
  ) =>
    keyAggExport(
      keyAggregate(publicKeys, tweak ? [tweak] : [], tweak ? [true] : []),
    );

  public static tweak = (musig: Musig, tweak: Uint8Array) => {
    return new Musig(musig.key, musig.publicKeys, musig.msg, tweak);
  };

  /**
   * Updates the message and regenerates the nonce because it depends on the message
   */
  public static updateMessage = (musig: Musig, msg: Uint8Array) => {
    return new Musig(musig.key, musig.publicKeys, msg, musig.tweak);
  };

  public numParticipants = (): number => {
    return this.publicKeys.length;
  };

  public getPublicNonce = (): Uint8Array => {
    return this.nonce.public;
  };

  public aggregateNoncesOrdered = (nonces: Uint8Array[]) => {
    if (this.session !== undefined) {
      throw new Error('nonces already aggregated');
    }

    if (this.publicKeys.length !== nonces.length) {
      throw new Error('number of nonces != number of public keys');
    }

    const myNonceIndex = nonces.findIndex((nonce) =>
      uint8ArrayEqual(this.nonce.public, nonce),
    );
    if (myNonceIndex !== this.myIndex) {
      throw new Error('our nonce is at incorrect index');
    }

    this.pubNonces = nonces;
    this.session = new Session(
      nonceAggregate(nonces),
      this.publicKeys,
      this.msg,
      this.tweak ? [this.tweak] : [],
      this.tweak ? [true] : [],
    );
  };

  public aggregateNonces = (nonces: [Uint8Array, Uint8Array][]) => {
    let noncesToUse = nonces;
    if (
      nonces.find(([keyCmp]) => uint8ArrayEqual(this.key.publicKey, keyCmp)) ===
      undefined
    ) {
      noncesToUse = [...nonces, [this.key.publicKey, this.getPublicNonce()]];
    }

    if (this.publicKeys.length !== noncesToUse.length) {
      throw new Error('number of nonces != number of public keys');
    }

    const ordered: Uint8Array[] = [];

    for (const key of this.publicKeys) {
      const nonce = noncesToUse.find(([keyCmp]) =>
        uint8ArrayEqual(key, keyCmp),
      );
      if (nonce === undefined) {
        throw new Error(
          `could not find nonce for public key ${uint8ArrayToHex(key)}`,
        );
      }

      ordered.push(nonce[1]);
    }

    this.aggregateNoncesOrdered(ordered);
  };

  /**
   * Returns our partial signature and adds it to the internal list
   */
  public signPartial = () => {
    if (this.session === undefined) {
      throw new Error('session not initialized');
    }

    const sig = this.session.sign(
      this.nonce.secret,
      this.key.privateKey!,
      true,
    );
    this.partialSignatures[this.myIndex] = sig;

    return sig;
  };

  public verifyPartial = (
    publicKeyOrIndex: Uint8Array | number,
    signature: Uint8Array,
  ): boolean => {
    if (this.pubNonces === undefined) {
      throw new Error('public nonces missing');
    }

    if (this.session === undefined) {
      throw new Error('session not initialized');
    }

    const publicKey =
      typeof publicKeyOrIndex === 'number'
        ? this.publicKeys[publicKeyOrIndex]
        : publicKeyOrIndex;
    const index = this.indexOfPublicKeyOrIndex(publicKey);

    return this.session.partialSigVerify(signature, this.pubNonces, index);
  };

  /**
   * Adds a partial signature after verifying it
   */
  public addPartial = (
    publicKeyOrIndex: Uint8Array | number,
    signature: Uint8Array,
  ) => {
    if (!this.verifyPartial(publicKeyOrIndex, signature)) {
      throw new Error('invalid partial signature');
    }

    this.partialSignatures[this.indexOfPublicKeyOrIndex(publicKeyOrIndex)] =
      signature;
  };

  public aggregatePartials = (): Uint8Array => {
    if (this.session === undefined) {
      throw new Error('session not initialized');
    }

    if (this.partialSignatures.some((partial) => partial === null)) {
      throw new Error('not all partial signatures are set');
    }

    return this.session.partialSigAgg(this.partialSignatures as Uint8Array[]);
  };

  private indexOfPublicKeyOrIndex = (
    publicKeyOrIndex: Uint8Array | number,
  ): number => {
    const index =
      typeof publicKeyOrIndex === 'number'
        ? publicKeyOrIndex
        : this.publicKeys.findIndex((key) =>
            uint8ArrayEqual(publicKeyOrIndex, key),
          );

    if (index === -1) {
      throw new Error(
        `could not find index of public key ${uint8ArrayToHex(publicKeyOrIndex as Uint8Array)}`,
      );
    }

    if (index > this.publicKeys.length - 1) {
      throw new Error('index out of range');
    }

    return index;
  };
}

export default Musig;
