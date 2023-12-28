import Musig from './musig/Musig';
import swapTree from './swap/SwapTree';
import { targetFee } from './TargetFee';
import Networks from './consts/Networks';
import * as Scripts from './swap/Scripts';
import swapScript from './swap/SwapScript';
import { OutputType } from './consts/Enums';
import * as SwapUtils from './swap/SwapUtils';
import { detectSwap } from './swap/SwapDetector';
import * as TaprootUtils from './swap/TaprootUtils';
import reverseSwapTree from './swap/ReverseSwapTree';
import reverseSwapScript from './swap/ReverseSwapScript';
import { constructClaimTransaction } from './swap/Claim';
import { detectPreimage } from './swap/PreimageDetector';
import { constructRefundTransaction } from './swap/Refund';
import * as SwapTreeSerializer from './swap/SwapTreeSerializer';
import {
  ClaimDetails,
  RefundDetails,
  ScriptElement,
  TransactionOutput,
} from './consts/Types';
import ERC20ABI from '../out/ERC20.sol/ERC20.json';
import EtherSwapABI from '../out/EtherSwap.sol/EtherSwap.json';
import ERC20SwapABI from '../out/ERC20Swap.sol/ERC20Swap.json';

const ContractABIs = {
  ERC20: ERC20ABI.abi,
  EtherSwap: EtherSwapABI.abi,
  ERC20Swap: ERC20SwapABI.abi,
};

export {
  Musig,
  Networks,
  OutputType,
  ContractABIs,
  ClaimDetails,
  ScriptElement,
  RefundDetails,
  TransactionOutput,
  Scripts,
  SwapUtils,
  TaprootUtils,
  SwapTreeSerializer,
  swapTree,
  targetFee,
  swapScript,
  detectSwap,
  detectPreimage,
  reverseSwapTree,
  reverseSwapScript,
  constructClaimTransaction,
  constructRefundTransaction,
};
