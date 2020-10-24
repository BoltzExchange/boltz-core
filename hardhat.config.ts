import fs from 'fs';
import { Wallet } from 'ethers';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import { contracts, deploy } from './scripts/deploy';
import { HardhatUserConfig, task } from 'hardhat/config';

const paths = {
  infuraKey: '.infura.key',
  etherscanKey: '.etherscan.key',
  mnemonics: '.mnemonics.json',
};

const mnemonics = fs.existsSync(paths.mnemonics) ? JSON.parse(fs.readFileSync(paths.mnemonics).toString()) : undefined;
const infuraKey = fs.existsSync(paths.infuraKey) ? fs.readFileSync(paths.infuraKey).toString().trim() : '';
const etherscanKey = fs.existsSync(paths.etherscanKey) ? fs.readFileSync(paths.etherscanKey).toString().trim() : '';

const mnemonicKeys = {
  testnet: mnemonics ? Wallet.fromMnemonic(mnemonics.testnet).privateKey : '',
  mainnet: mnemonics ? Wallet.fromMnemonic(mnemonics.mainnet).privateKey : '',
};

const config: HardhatUserConfig = {
  solidity: {
    version: '0.7.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    }
  },
  networks: {
    rinkeby: {
      from: mnemonicKeys.testnet,
      url: `https://rinkeby.infura.io/v3/${infuraKey}`,
    },
    mainnet: {
      from: mnemonicKeys.mainnet,
      url: `https://mainnet.infura.io/v3/${infuraKey}`,
    },
  },
  etherscan: {
    apiKey: etherscanKey,
  },
};

task('accounts', 'Prints all accounts', async (_, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (let i = 0; i < accounts.length; i += 1) {
    console.log(`${i + 1}: ${await accounts[i].getAddress()}`);
  }
});

task('deploy', 'Deploy the contracts', async (_, hre) => {
  await deploy(hre);
});

task('deploy-verify', 'Deploy the contracts and verify them on Etherscan', async (_, hre) => {
  const addresses = await deploy(hre);

  // Don't verify the ERC20 contract
  if (contracts.length === 3) {
    contracts.pop();
  }

  console.log(`Verifying contracts on Etherscan contracts: ${Object.values(contracts).join(', ')}`);
  console.log();

  for (let i = 0; i < contracts.length; i += 1) {
    await hre.run('verify', { contractName: contracts[i], address: addresses[i] });
  }
});

export default config;
