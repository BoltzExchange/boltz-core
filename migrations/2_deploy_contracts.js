const ERC20Swap = artifacts.require('ERC20Swap');
const EtherSwap = artifacts.require('EtherSwap');

module.exports = function(deployer) {
  deployer.deploy(ERC20Swap);
  deployer.deploy(EtherSwap);
};
