import fs from 'fs';
import path from 'path';

const contractsPath = `${path.resolve(__dirname, '..', '..')}/build/contracts`;

const readAbiFile = (contractName: string) => {
  return fs.readFileSync(`${contractsPath}/${contractName}.json`);
};

const loadAbi = (contractName: string) => {
  return JSON.parse(readAbiFile(contractName).toString())['abi'];
};

const IERC20ABI = loadAbi('IERC20');
const ERC20SwapABI = loadAbi('ERC20Swap');
const EtherSwapABI = loadAbi('EtherSwap');

export {
  IERC20ABI,
  ERC20SwapABI,
  EtherSwapABI,
};
