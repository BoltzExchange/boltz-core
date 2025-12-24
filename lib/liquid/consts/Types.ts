import type { Transaction, TxOutput } from 'liquidjs-lib';
import type { LiquidSwapTree, RefundDetails } from '../../consts/Types';

export type LiquidRefundDetails = Omit<
  RefundDetails,
  'amount' | 'swapTree' | 'privateKey'
> &
  TxOutput & {
    // Optional because covenant claims don't need to sign the transaction
    privateKey?: Uint8Array;
    legacyTx?: Transaction;
    swapTree?: LiquidSwapTree;
    blindingPrivateKey?: Uint8Array;
  };

export type LiquidClaimDetails = LiquidRefundDetails & {
  preimage: Uint8Array;
};
