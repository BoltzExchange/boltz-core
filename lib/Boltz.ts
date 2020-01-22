import Networks from './consts/Networks';
import * as Scripts from './swap/Scripts';
import swapScript from './swap/SwapScript';
import { OutputType } from './consts/Enums';
import * as SwapUtils from './swap/SwapUtils';
import { detectSwap } from './swap/SwapDetector';
import reverseSwapScript from './swap/ReverseSwapScript';
import { constructClaimTransaction } from './swap/Claim';
import { detectPreimage } from './swap/PreimageDetector';
import * as ContractABIs from './ethereum/ABIs';
import { constructRefundTransaction } from './swap/Refund';
import { estimateFee, estimateSize } from './FeeCalculator';
import { ScriptElement, TransactionOutput } from './consts/Types';

export {
  Networks,
  OutputType,
  ScriptElement,
  TransactionOutput,

  Scripts,

  swapScript,
  reverseSwapScript,

  detectSwap,
  detectPreimage,

  estimateFee,
  estimateSize,

  constructClaimTransaction,
  constructRefundTransaction,

  SwapUtils,

  ContractABIs,
};
