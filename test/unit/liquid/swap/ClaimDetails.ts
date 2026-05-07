import { Transaction, confidential } from 'liquidjs-lib';
import type { OutputType } from '../../../../lib/consts/Enums.ts';
import type { LiquidClaimDetails } from '../../../../lib/liquid/index.ts';
import { Networks } from '../../../../lib/liquid/index.ts';
import { claimDetails } from '../../swap/ClaimDetails.ts';

export const nonce = Buffer.from('00', 'hex');

const prefixUnconfidential = Buffer.from('01', 'hex');
export const lbtcRegtest = Buffer.concat([
  prefixUnconfidential,
  Buffer.from(Networks.liquidRegtest.assetHash, 'hex').reverse(),
]);

export const liquidClaimDetails = claimDetails.map((details) => ({
  ...details,
  nonce,
  asset: lbtcRegtest,
  value: confidential.satoshiToConfidentialValue(Number(details.amount)),
  legacyTx: new Transaction(),
})) as unknown as LiquidClaimDetails[];

export const liquidClaimDetailsMap = new Map<OutputType, LiquidClaimDetails>(
  liquidClaimDetails.map((entry) => [entry.type, entry]),
);
