import {
  findScriptPath,
  HashTree,
  LEAF_VERSION_TAPSCRIPT,
  tapleafHash,
  tapTweakHash,
  tweakKey,
} from 'bitcoinjs-lib/src/payments/bip341';
import { Transaction } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import Musig from '../musig/Musig';
import { toPushdataScript } from './SwapUtils';
import { RefundDetails, ScriptElement, Tapleaf } from '../consts/Types';

export const createControlBlock = (
  hashTree: HashTree,
  leaf: Tapleaf,
  internalKey: Buffer,
): Buffer => {
  const path = findScriptPath(hashTree, tapleafHash(leaf));
  if (path === undefined) {
    throw 'leaf not in tree';
  }

  const outputKey = tweakKey(internalKey, hashTree.hash)!;

  return Buffer.concat(
    [Buffer.from([leaf.version | outputKey.parity]), internalKey].concat(path),
  );
};

export const createLeaf = (script: ScriptElement[]): Tapleaf => ({
  version: LEAF_VERSION_TAPSCRIPT,
  output: toPushdataScript(script),
});

export const hashForWitnessV1 = (
  details: RefundDetails[],
  tx: Transaction,
  index: number,
  leafHash?: Buffer,
  hashType: number = Transaction.SIGHASH_DEFAULT,
): Buffer => {
  return tx.hashForWitnessV1(
    index,
    details.map((out) => out.script),
    details.map((out) => out.value),
    hashType,
    leafHash,
  );
};

export const tweakMusig = (musig: Musig, tweak: Buffer): Buffer => {
  return toXOnly(
    musig.tweakKey(tapTweakHash(musig.getAggregatedPublicKey(), tweak)),
  );
};
