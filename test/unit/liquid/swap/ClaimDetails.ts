import { confidential } from 'liquidjs-lib';
import { Networks } from '../../../../lib/liquid';
import { claimDetails } from '../../swap/ClaimDetails';
import { OutputType } from '../../../../lib/consts/Enums';
import { LiquidClaimDetails } from '../../../../lib/liquid';

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
