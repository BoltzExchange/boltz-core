import type { BIP32Interface } from 'bip32';
import type { ECPairInterface } from 'ecpair';
import type { Transaction, TxOutput } from 'liquidjs-lib';
import type { LiquidSwapTree, RefundDetails } from '../../consts/Types';

export type LiquidRefundDetails = Omit<RefundDetails, 'value' | 'swapTree'> &
  TxOutput & {
    legacyTx?: Transaction;
    swapTree?: LiquidSwapTree;
    blindingPrivateKey?: Buffer;
  };

export type LiquidClaimDetails = Omit<LiquidRefundDetails, 'keys'> & {
  preimage: Buffer;
  keys?: ECPairInterface | BIP32Interface;
};
