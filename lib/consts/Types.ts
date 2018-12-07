import { Out } from 'bitcoinjs-lib';
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
