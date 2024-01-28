import { BIP32Interface } from 'bip32';
import { ECPairInterface } from 'ecpair';
import { Transaction, TxOutput } from 'liquidjs-lib';
import { RefundDetails, SwapTree, Tapleaf } from '../../consts/Types';

export type LiquidSwapTree = SwapTree & { covenantClaimLeaf?: Tapleaf };

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
