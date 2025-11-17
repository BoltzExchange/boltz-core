import type { BIP32Interface } from 'bip32';
import type { TxOutput } from 'bitcoinjs-lib';
import type { Taptree } from 'bitcoinjs-lib/src/types';
import type { ECPairInterface } from 'ecpair';
import type { OutputType } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type ScriptElement = Buffer | number | string;

export type TransactionOutput = {
  txHash: Buffer;
  vout: number;
  type: OutputType;
} & TxOutput;

export type RefundDetails = TransactionOutput & {
  keys: ECPairInterface | BIP32Interface;

  // Not set for type Taproot
  redeemScript?: Buffer;

  // Set for type Taproot
  swapTree?: SwapTree;

  // Set for type Taproot
  internalKey?: Buffer;

  // Only relevant for type Taproot
  // If true, the input will not be spent by the script-path so that
  // the key-path can be used with a cooperative signature
  cooperative?: boolean;
};

export type ClaimDetails = RefundDetails & {
  preimage: Buffer;
};

export type Tapleaf = {
  output: Buffer;
  version: number;
};

export type HashLeaf = {
  hash: Buffer;
};

export type HashBranch = {
  hash: Buffer;
  left: HashLeaf;
  right: HashLeaf;
};

export type SwapTree = {
  tree: Taptree;
  claimLeaf: Tapleaf;
  refundLeaf: Tapleaf;
};

export type LiquidSwapTree = SwapTree & { covenantClaimLeaf?: Tapleaf };
