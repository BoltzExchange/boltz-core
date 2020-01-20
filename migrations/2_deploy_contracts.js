const BN = require('bn.js');

const ERC20Swap = artifacts.require('ERC20Swap');
const EtherSwap = artifacts.require('EtherSwap');
const TestERC20 = artifacts.require('TestERC20');

module.exports = function(deployer, network) {
  deployer.deploy(ERC20Swap);
  deployer.deploy(EtherSwap);

  if (network !== 'mainnet') {
    const decimals = new BN(10).pow(new BN(18));
    deployer.deploy(TestERC20, new BN(1000).mul(decimals));
  }
};
