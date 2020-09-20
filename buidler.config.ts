import fs from 'fs';
import { Wallet } from 'ethers';
import { BuidlerConfig, task, usePlugin } from '@nomiclabs/buidler/config';
import { contracts, deploy } from './scripts/deploy';

usePlugin('@nomiclabs/buidler-ethers');
usePlugin('@nomiclabs/buidler-waffle');
usePlugin('@nomiclabs/buidler-solhint');
usePlugin('@nomiclabs/buidler-etherscan');

const paths = {
  infuraKey: '.infura.key',
  etherscanKey: '.etherscan.key',
  mnemonic: '.deployment.mnemonic',
};

const mnemonic = fs.existsSync(paths.mnemonic) ? fs.readFileSync(paths.mnemonic).toString().trim() : '';
const infuraKey = fs.existsSync(paths.infuraKey) ? fs.readFileSync(paths.infuraKey).toString().trim() : '';
const etherscanKey = fs.existsSync(paths.etherscanKey) ? fs.readFileSync(paths.etherscanKey).toString().trim() : '';

const mnemonicKey = mnemonic !== '' ? Wallet.fromMnemonic(mnemonic).privateKey : '';

const config: BuidlerConfig = {
  solc: {
    version: '0.6.12',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  networks: {
    rinkeby: {
      accounts: [mnemonicKey],
      url: `https://rinkeby.infura.io/v3/${infuraKey}`,
    },
    ganache: {
      accounts: ['0xc62d626999898ce6b5e4cb7122d7f9ffa3c08dda6d1b2b35ec3a4e0b9ebfd5dc'],
      url: 'http://127.0.0.1:8545',
    },
  },
  etherscan: {
    apiKey: etherscanKey,
  },
};

task('accounts', 'Prints all accounts', async (_, bre) => {
  const accounts = await bre.ethers.getSigners();

  for (let i = 0; i < accounts.length; i += 1) {
    console.log(`${i + 1}: ${await accounts[i].getAddress()}`);
  }
});

task('deploy', 'Deploy the contracts', async (_, bre) => {
  await deploy(bre);
});

task('deploy-verify', 'Deploy the contracts and verify them on Etherscan', async (_, bre) => {
  const addresses = await deploy(bre);

  // Don't verify the ERC20 contract
  if (contracts.length === 3) {
    contracts.pop();
  }

  console.log(`Verifying contracts on Etherscan contracts: ${Object.values(contracts).join(', ')}`);
  console.log();

  for (let i = 0; i < contracts.length; i += 1) {
    await bre.run('verify-contract', { contractName: contracts[i], address: addresses[i] });
  }
});

export default config;
