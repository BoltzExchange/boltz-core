import Errors from './consts/Errors';
import { targetFee } from './TargetFee';
import Networks from './consts/Networks';
import * as Scripts from './swap/Scripts';
import swapScript from './swap/SwapScript';
import { OutputType } from './consts/Enums';
import * as SwapUtils from './swap/SwapUtils';
import { detectSwap } from './swap/SwapDetector';
import reverseSwapScript from './swap/ReverseSwapScript';
import { constructClaimTransaction } from './swap/Claim';
import { detectPreimage } from './swap/PreimageDetector';
import { constructRefundTransaction } from './swap/Refund';
import { ScriptElement, TransactionOutput } from './consts/Types';
import ERC20ABI from '../out/ERC20.sol/ERC20.json';
import EtherSwapABI from '../out/EtherSwap.sol/EtherSwap.json';
import ERC20SwapABI from '../out/ERC20Swap.sol/ERC20Swap.json';

const ContractABIs = {
  ERC20: ERC20ABI.abi,
  EtherSwap: EtherSwapABI.abi,
  ERC20Swap: ERC20SwapABI.abi,
};

export {
  Errors,
  Networks,
  OutputType,
  ScriptElement,
  TransactionOutput,
  Scripts,
  targetFee,
  swapScript,
  reverseSwapScript,
  detectSwap,
  detectPreimage,
  constructClaimTransaction,
  constructRefundTransaction,
  SwapUtils,
  ContractABIs,
};
