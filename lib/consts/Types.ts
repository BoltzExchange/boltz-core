import type { OutputType } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type RefundDetails = {
  transactionId: string;
  vout: number;
  script: Uint8Array;
  amount: bigint;
  type: OutputType;
  privateKey: Uint8Array;

  // Legacy swaps
  redeemScript?: Uint8Array;

  // Taproot swaps
  cooperative?: boolean;
  swapTree?: SwapTree;
  internalKey?: Uint8Array;
};

export type ClaimDetails = RefundDetails & {
  preimage: Uint8Array;
};

export type TapLeaf = {
  output: Uint8Array;
  version: number;
};

export type TapTree = [TapTree | TapLeaf, TapTree | TapLeaf] | TapLeaf;

export type SwapTree = {
  tree: TapTree;
  claimLeaf: TapLeaf;
  refundLeaf: TapLeaf;
};

export type LiquidSwapTree = SwapTree & { covenantClaimLeaf?: TapLeaf };
