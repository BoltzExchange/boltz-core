import { BIP32 } from 'bip32';
import { Out, ECPair } from 'bitcoinjs-lib';
import { OutputType } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type ScriptElement = Buffer | number;

export type TransactionOutput = {
  txHash: Buffer;
  vout: number;
  type: OutputType;
} & Out;

export type RefundDetails = TransactionOutput & {
  keys: ECPair | BIP32;
  redeemScript: Buffer;
};

export type ClaimDetails = RefundDetails & {
  preimage: Buffer;
};
