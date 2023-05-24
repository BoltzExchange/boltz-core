import { Transaction, TxOutput } from 'liquidjs-lib';
import { RefundDetails } from '../../consts/Types';

export type LiquidRefundDetails = RefundDetails &
  TxOutput & {
    legacyTx?: Transaction;
    blindingPrivKey?: Buffer;
  };

export type LiquidClaimDetails = LiquidRefundDetails & {
  preimage: Buffer;
};
