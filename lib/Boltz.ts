import { targetFee } from './TargetFee';
import { OutputType } from './consts/Enums';
import Networks from './consts/Networks';
import * as Types from './consts/Types';
import type { ClaimDetails, RefundDetails } from './consts/Types';
import * as Musig from './musig/Musig';
import { constructClaimTransaction } from './swap/Claim';
import { detectPreimage } from './swap/PreimageDetector';
import { constructRefundTransaction } from './swap/Refund';
import reverseSwapScript from './swap/ReverseSwapScript';
import reverseSwapTree, {
  extractClaimPublicKeyFromReverseSwapTree,
  extractRefundPublicKeyFromReverseSwapTree,
} from './swap/ReverseSwapTree';
import * as Scripts from './swap/Scripts';
import { detectSwap } from './swap/SwapDetector';
import swapScript from './swap/SwapScript';
import swapTree, {
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  fundingAddressTree,
} from './swap/SwapTree';
import { compareTrees } from './swap/SwapTreeCompare';
import * as SwapTreeSerializer from './swap/SwapTreeSerializer';
import * as TaprootUtils from './swap/TaprootUtils';

export type { ClaimDetails, RefundDetails };

export {
  Musig,
  Types,
  Networks,
  OutputType,
  Scripts,
  TaprootUtils,
  SwapTreeSerializer,
  swapTree,
  targetFee,
  swapScript,
  detectSwap,
  compareTrees,
  detectPreimage,
  reverseSwapTree,
  reverseSwapScript,
  fundingAddressTree,
  constructClaimTransaction,
  constructRefundTransaction,
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  extractClaimPublicKeyFromReverseSwapTree,
  extractRefundPublicKeyFromReverseSwapTree,
};
