import { confidential } from 'liquidjs-lib';
import type { OutputType } from '../../../../lib/consts/Enums';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import { Networks } from '../../../../lib/liquid';
import { claimDetails } from '../../swap/ClaimDetails';

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
  value: confidential.satoshiToConfidentialValue(details.value),
}));

export const liquidClaimDetailsMap = new Map<OutputType, LiquidClaimDetails>(
  liquidClaimDetails.map((entry) => [entry.type, entry]),
);
