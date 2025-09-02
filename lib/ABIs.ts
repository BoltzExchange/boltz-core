import ERC20ABI from '../out/ERC20.sol/ERC20.json';
import ERC20SwapABI from '../out/ERC20Swap.sol/ERC20Swap.json';
import EtherSwapABI from '../out/EtherSwap.sol/EtherSwap.json';
import RouterABI from '../out/Router.sol/Router.json';

export const ContractABIs = {
  ERC20: ERC20ABI.abi,
  ERC20Swap: ERC20SwapABI.abi,
  EtherSwap: EtherSwapABI.abi,
  Router: RouterABI.abi,
} as const;
