import { Transaction, TxOutput } from 'liquidjs-lib';
import { RefundDetails } from '../../consts/Types';

export type LiquidRefundDetails = Omit<RefundDetails, 'value'> &
  TxOutput & {
    legacyTx?: Transaction;
    blindingPrivateKey?: Buffer;
  };

export type LiquidClaimDetails = LiquidRefundDetails & {
  preimage: Buffer;
};
