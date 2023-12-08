import { ECPairInterface } from 'ecpair';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { Secp256k1ZKP } from '@michael1011/secp256k1-zkp';

class Musig {
  private readonly pubkeyAgg: {
    aggPubkey: Uint8Array;
    keyaggCache: Uint8Array;
  };
  private readonly nonce: {
    pubNonce: Uint8Array;
    secNonce: Uint8Array;
  };

  private readonly myIndex: number;
  private readonly partialSignatures: (Uint8Array | null)[];

  private pubNonces?: Uint8Array[];

  private nonceAgg?: Uint8Array;
  private session?: Uint8Array;

  constructor(
    private readonly secp: Secp256k1ZKP,
    private readonly key: ECPairInterface,
    public readonly sessionId: Buffer,
    public readonly publicKeys: Buffer[],
  ) {
    if (publicKeys.length < 2) {
      throw 'need at least 2 keys to aggregate';
    }

    this.myIndex = this.publicKeys.findIndex((key) =>
      this.key.publicKey.equals(key),
    );

    if (this.myIndex === -1) {
      throw 'our key is not publicKeys';
    }

    this.pubkeyAgg = this.secp.musig.pubkeyAgg(publicKeys.map(toXOnly));
    this.nonce = this.secp.musig.nonceGen(sessionId);
    this.partialSignatures = Array(publicKeys.length).fill(null);
  }

  public numParticipants = (): number => {
    return this.publicKeys.length;
  };

  public getAggregatedPublicKey = (): Buffer => {
    return Buffer.from(this.pubkeyAgg.aggPubkey);
  };

  public getPublicNonce = (): Uint8Array => {
    return this.nonce.pubNonce;
  };

  public tweakKey = (tweak: Uint8Array): Buffer => {
    const tweaked = this.secp.musig.pubkeyXonlyTweakAdd(
      this.pubkeyAgg.keyaggCache,
      tweak,
      true,
    );
    this.pubkeyAgg.keyaggCache = tweaked.keyaggCache;
    return Buffer.from(tweaked.pubkey);
  };

  public aggregateNoncesOrdered = (nonces: Uint8Array[]) => {
    if (this.publicKeys.length !== nonces.length) {
      throw 'number of nonces != number of public keys';
    }

    const myNonceIndex = nonces.findIndex((nonce) =>
      Buffer.from(this.nonce.pubNonce).equals(nonce),
    );
    if (myNonceIndex !== this.myIndex) {
      throw 'our nonce is at incorrect index';
    }

    this.pubNonces = nonces;
    this.nonceAgg = this.secp.musig.nonceAgg(nonces);
  };

  public aggregateNonces = (nonces: Map<Uint8Array, Uint8Array>) => {
    const ordered: Uint8Array[] = [];

    if (!nonces.has(this.key.publicKey)) {
      nonces.set(this.key.publicKey, this.getPublicNonce());
    }

    if (this.publicKeys.length !== nonces.size) {
      throw 'number of nonces != number of public keys';
    }

    for (const key of this.publicKeys) {
      const nonce = nonces.get(key);
      if (nonce === undefined) {
        throw `could not find nonce for public key ${key.toString('hex')}`;
      }

      ordered.push(nonce);
    }

    this.aggregateNoncesOrdered(ordered);
  };

  public initializeSession = (msg: Uint8Array) => {
    if (this.nonceAgg === undefined) {
      throw 'nonces not aggregated';
    }

    if (this.session !== undefined) {
      throw 'session already initialized';
    }

    this.session = this.secp.musig.nonceProcess(
      this.nonceAgg,
      msg,
      this.pubkeyAgg.keyaggCache,
    );
  };

  /**
   * Returns our partial signature and adds it to the internal list
   */
  public signPartial = () => {
    if (this.session === undefined) {
      throw 'session not initialized';
    }

    const sig = this.secp.musig.partialSign(
      this.nonce.secNonce,
      this.key.privateKey!,
      this.pubkeyAgg.keyaggCache,
      this.session,
    );
    this.partialSignatures[this.myIndex] = sig;

    return sig;
  };

  public verifyPartial = (
    publicKeyOrIndex: Buffer | number,
    signature: Uint8Array,
  ): boolean => {
    if (this.pubNonces === undefined) {
      throw 'public nonces missing';
    }

    if (this.session === undefined) {
      throw 'session not initialized';
    }

    const publicKey =
      typeof publicKeyOrIndex === 'number'
        ? this.publicKeys[publicKeyOrIndex]
        : publicKeyOrIndex;
    const index = this.indexOfPublicKeyOrIndex(publicKey);

    return this.secp.musig.partialVerify(
      signature,
      this.pubNonces[index],
      toXOnly(publicKey),
      this.pubkeyAgg.keyaggCache,
      this.session,
    );
  };

  /**
   * Adds a partial signature after verifying it
   */
  public addPartial = (
    publicKeyOrIndex: Buffer | number,
    signature: Uint8Array,
  ) => {
    if (!this.verifyPartial(publicKeyOrIndex, signature)) {
      throw 'invalid partial signature';
    }

    this.partialSignatures[this.indexOfPublicKeyOrIndex(publicKeyOrIndex)] =
      signature;
  };

  public aggregatePartials = (): Buffer => {
    if (this.session === undefined) {
      throw 'session not initialized';
    }

    if (this.partialSignatures.some((partial) => partial === null)) {
      throw 'not all partial signatures are set';
    }

    return Buffer.from(
      this.secp.musig.partialSigAgg(
        this.session,
        this.partialSignatures as Uint8Array[],
      ),
    );
  };

  private indexOfPublicKeyOrIndex = (
    publicKeyOrIndex: Buffer | number,
  ): number => {
    const index =
      typeof publicKeyOrIndex === 'number'
        ? publicKeyOrIndex
        : this.publicKeys.findIndex((key) => publicKeyOrIndex.equals(key));

    if (index === -1) {
      throw `could not find index of public key ${Buffer.from(
        publicKeyOrIndex as Uint8Array,
      ).toString('hex')}`;
    }

    if (index > this.publicKeys.length - 1) {
      throw 'index out of range';
    }

    return index;
  };
}

export default Musig;
