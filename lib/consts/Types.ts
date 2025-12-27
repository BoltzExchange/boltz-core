import type { OutputType } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type BaseRefundDetails = {
  transactionId: string;
  vout: number;
  script: Uint8Array;
  amount: bigint;
  privateKey: Uint8Array;
};

export type LegacyRefundDetails = BaseRefundDetails & {
  type: OutputType.Legacy | OutputType.Compatibility | OutputType.Bech32;
  redeemScript: Uint8Array;

  cooperative?: never;
  swapTree?: never;
  internalKey?: never;
};

export type TaprootRefundDetails = BaseRefundDetails & {
  type: OutputType.Taproot;
  cooperative?: boolean;
  swapTree?: SwapTree;
  internalKey?: Uint8Array;

  redeemScript?: never;
};

export type RefundDetails = LegacyRefundDetails | TaprootRefundDetails;

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
