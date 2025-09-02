import { targetFee } from './TargetFee';
import { OutputType } from './consts/Enums';
import Networks from './consts/Networks';
import * as Types from './consts/Types';
import {
  ClaimDetails,
  RefundDetails,
  ScriptElement,
  TransactionOutput,
} from './consts/Types';
import { init } from './init';
import Musig from './musig/Musig';
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
} from './swap/SwapTree';
import { compareTrees } from './swap/SwapTreeCompare';
import * as SwapTreeSerializer from './swap/SwapTreeSerializer';
import * as SwapUtils from './swap/SwapUtils';
import * as TaprootUtils from './swap/TaprootUtils';

export {
  Musig,
  Types,
  Networks,
  OutputType,
  ClaimDetails,
  ScriptElement,
  RefundDetails,
  TransactionOutput,
  Scripts,
  SwapUtils,
  TaprootUtils,
  SwapTreeSerializer,
  init,
  swapTree,
  targetFee,
  swapScript,
  detectSwap,
  compareTrees,
  detectPreimage,
  reverseSwapTree,
  reverseSwapScript,
  constructClaimTransaction,
  constructRefundTransaction,
  extractClaimPublicKeyFromSwapTree,
  extractRefundPublicKeyFromSwapTree,
  extractClaimPublicKeyFromReverseSwapTree,
  extractRefundPublicKeyFromReverseSwapTree,
};
