import { BIP32Interface } from 'bip32';
import { TxOutput, ECPair } from 'bitcoinjs-lib';
import { OutputType } from './Enums';

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
  keys: ECPair.ECPairInterface | BIP32Interface;
  redeemScript: Buffer;
};

export type ClaimDetails = RefundDetails & {
  preimage: Buffer;
};
