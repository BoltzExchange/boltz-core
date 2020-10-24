import { BigNumber, Contract, utils } from 'ethers';
import { HardhatRuntimeEnvironment } from  'hardhat/types/runtime';

const contracts = [
  'EtherSwap',
  'ERC20Swap',
  'TestERC20',
];

const tokenDecimals = BigNumber.from(10).pow(18);
const tokenSupply = tokenDecimals.mul(1000000);

let gasSpent = BigNumber.from(0);

const getGasPrice = async (hre: HardhatRuntimeEnvironment) => {
  const weiToGwei = BigNumber.from(10).pow(9);

  const configGasPrice = hre.network.config.gasPrice;
  const gasPrice = typeof configGasPrice === 'number' ?
    BigNumber.from(configGasPrice) :
    await hre.ethers.provider.getGasPrice();

  return gasPrice.div(weiToGwei);
};

const wait = (seconds: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

const waitForReceipt = async (bre: HardhatRuntimeEnvironment, transactionHash: string) => {
  const receipt = await bre.ethers.provider.getTransactionReceipt(transactionHash);

  if (receipt === null) {
    await wait(1);
    return waitForReceipt(bre, transactionHash);
  }

  return receipt;
};

const deployContract = async (hre: HardhatRuntimeEnvironment, contractName: string, tokenSupply?: BigNumber) => {
  console.log(`Deploying ${contractName}`);

  if (tokenSupply) {
    console.log(`With supply: ${tokenSupply.div(tokenDecimals)}`);
  }

  console.log();

  const factory = await hre.ethers.getContractFactory(contractName);

  let contract: Contract;

  if (tokenSupply) {
    contract = await factory.deploy('TestERC20', 'TRC', 18, tokenSupply);
  } else {
    contract = await factory.deploy();
  }

  console.log(`  Transaction: ${contract.deployTransaction.hash}`);

  const deployReceipt = await waitForReceipt(hre, contract.deployTransaction.hash);

  gasSpent = gasSpent.add(deployReceipt.gasUsed.mul(contract.deployTransaction.gasPrice));

  console.log(`  Address: ${contract.address}`);
  console.log();

  return contract.address;
};

const deploy = async (hre: HardhatRuntimeEnvironment): Promise<string[]> => {
  // Don't deploy the test token on mainnet
  if (hre.network.name === 'mainnet') {
    contracts.pop();
  }

  console.log();
  console.log(`Using address: ${await (await hre.ethers.getSigners())[0].getAddress()} `);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Gas price: ${await getGasPrice(hre)} gwei`);
  console.log(`Deploying contracts: ${Object.values(contracts).join(', ')}`);
  console.log();

  const addresses: string[] = [];

  for (const contract of contracts) {
    // The token needs an argument in the constructor
    if (contracts.length === 3 && contract === contracts[2]) {
      addresses.push(await deployContract(hre, contracts[2], tokenSupply));
    } else {
      addresses.push(await deployContract(hre, contract));
    }
  }

  console.log(`Gas cost: ${utils.formatUnits(gasSpent, 'ether')}`);
  console.log();

  return addresses;
};

export {
  contracts,
  deploy,
};
