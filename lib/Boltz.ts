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
import { estimateFee, estimateSize } from './FeeCalculator';
import { ScriptElement, TransactionOutput } from './consts/Types';
import EtherSwapABI from '../artifacts/contracts/EtherSwap.sol/EtherSwap.json';
import ERC20SwapABI from '../artifacts/contracts/ERC20Swap.sol/ERC20Swap.json';
import ERC20ABI from '../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';

const ContractABIs = {
  ERC20: ERC20ABI.abi,
  EtherSwap: EtherSwapABI.abi,
  ERC20Swap: ERC20SwapABI.abi,
};

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
