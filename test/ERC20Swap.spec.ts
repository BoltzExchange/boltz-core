import BN from 'bn.js';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { getHexString, bufferToBytes, getEthereumTimestamp } from '../lib/Utils';
import { TestErc20Instance, Erc20SwapInstance } from '../types/truffle-contracts';

const TestERC20 = artifacts.require('TestERC20');
const ERC20Swap = artifacts.require('ERC20Swap');

contract('ERC20Swap', async (accounts) => {
  // Sample values
  const swapAmount = 10;
  const claimAddress = accounts[1];
  const timelock = getEthereumTimestamp();

  const preimage = randomBytes(32);
  const preimageHash = bufferToBytes(crypto.sha256(preimage));
  const preimageHashString = `0x${getHexString(crypto.sha256(preimage))}`;

  // Contract instances
  let token: TestErc20Instance;
  let instance: Erc20SwapInstance;

  before(async () => {
    // Deploy a test ERC20 contract and issue one token
    token = await TestERC20.new(new BN(10).pow(new BN(18)));
    instance = await ERC20Swap.new();
  });

  it('should not accept Ether', async () => {
    const amount = web3.utils.toWei(new BN(1), 'ether');

    let successfulTransfer = false;

    try {
      await web3.eth.sendTransaction({
        value: amount,
        from: accounts[0],
        to: instance.address,
      });
    } catch (error) {
      successfulTransfer = true;
    }

    if (!successfulTransfer) {
      throw { message: 'should not accept Ether' };
    }
  });

  it('should create new swaps', async () => {
    await token.increaseAllowance(instance.address, swapAmount);
    const result = await instance.create(preimageHash, swapAmount, token.address, claimAddress, timelock);

    expect((await token.balanceOf(instance.address)).toNumber()).to.be.equal(swapAmount);

    expect(result.logs[0].event).to.be.equal('Creation');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(preimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toNumber()).to.be.equal(swapAmount);
    expect(swapInfo[1]).to.be.equal(token.address);
    expect(swapInfo[2]).to.be.equal(claimAddress);
    expect(swapInfo[3]).to.be.equal(accounts[0]);
    expect(swapInfo[4].toNumber()).to.be.equal(timelock);
    expect(swapInfo[5]).to.be.true;

    // Test failure scenarios
    const revertPreimageHash = bufferToBytes(crypto.sha256(randomBytes(32)));

    try {
      await instance.create(revertPreimageHash, 0, token.address, claimAddress, timelock);
      throw { reason: 'should not create swaps with 0 amounts' };
    } catch (error) {
      expect(error.reason).to.be.equal('the amount must not be zero');
    }

    try {
      await instance.create(preimageHash, 1, token.address, claimAddress, timelock);
      throw { reason: 'should not create two swaps with the same preimage hash' };
    } catch (error) {
      expect(error.reason).to.be.equal('a swap with this preimage hash exists already');
    }

    try {
      await instance.create(revertPreimageHash, 1, token.address, claimAddress, timelock);
      throw { reason: 'should not create swaps when there is no allowance' };
    } catch (error) {
      expect(error.reason).to.be.equal('requested amount exceeds allowance');
    }

    try {
      const failedAllowance = 1;

      await token.increaseAllowance(instance.address, failedAllowance, {
        from: accounts[2],
      });

      await instance.create(revertPreimageHash, failedAllowance, token.address, claimAddress, timelock, {
        from: accounts[2],
      });

      throw { reason: 'should not create swaps when transferring the tokens fails' };
    } catch (error) {
      expect(error.reason).to.be.equal('ERC20: transfer amount exceeds balance');
    }
  });

  it('should not claim swaps with preimages that have an invalid length', async () => {
    const tryInvalidLength = async (length: number) => {
      try {
        await instance.claim(preimageHash, bufferToBytes(randomBytes(length)));
        throw { reason: 'should not claim swaps with preimages that have an invalid length' };
      } catch (error) {
        expect(error.reason).to.be.equal('the preimage has to the have a length of 32 bytes');
      }
    };

    await Promise.all([
      tryInvalidLength(31),
      tryInvalidLength(33),
      tryInvalidLength(64),
    ]);
  });

  it('should claim swaps', async () => {
    // Test claiming with an incorrect preimage
    try {
      await instance.claim(preimageHash, bufferToBytes(randomBytes(32)));
      throw { reason: 'should not claim swaps with a wrong preimage' };
    } catch (error) {
      expect(error.reason).to.be.equal('the preimage does not correspond the provided hash');
    }

    // Claim with the correct preimage
    const result = await instance.claim(preimageHash, bufferToBytes(preimage));

    expect((await token.balanceOf(instance.address)).toNumber()).to.be.equal(0);
    expect((await token.balanceOf(claimAddress)).toNumber()).to.be.equal(swapAmount);

    expect(result.logs[0].event).to.be.equal('Claim');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(preimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toNumber()).to.be.eq(swapAmount);
    expect(swapInfo[1]).to.be.equal(token.address);
    expect(swapInfo[2]).to.be.equal(claimAddress);
    expect(swapInfo[3]).to.be.equal(accounts[0]);
    expect(swapInfo[4].toNumber()).to.be.equal(timelock);
    expect(swapInfo[5]).to.be.false;

    // Test failure scenarios
    const rawRevertPreimage = randomBytes(32);
    const revertPreimage = bufferToBytes(rawRevertPreimage);
    const revertPreimageHash = bufferToBytes(crypto.sha256(rawRevertPreimage));

    try {
      await instance.claim(preimageHash, bufferToBytes(preimage));
      throw { reason: 'should not claim the same swap twice' };
    } catch (error) {
      expect(error.reason).to.be.equal('there is no pending swap with this preimage hash');
    }

    try {
      await instance.claim(revertPreimageHash, revertPreimage);
      throw { reason: 'should not claim nonexistent swaps' };
    } catch (error) {
      expect(error.reason).to.be.equal('there is no pending swap with this preimage hash');
    }
  });

  it('should refund swaps', async () => {
    const initialSenderTokenBalance = await token.balanceOf(accounts[0]);

    const refundPreimage = randomBytes(32);
    const refundPreimageHash = bufferToBytes(crypto.sha256(refundPreimage));
    const refundPreimageHashString = `0x${getHexString(crypto.sha256(refundPreimage))}`;

    await token.increaseAllowance(instance.address, swapAmount);
    await instance.create(refundPreimageHash, swapAmount, token.address, claimAddress, timelock);

    const result = await instance.refund(refundPreimageHash);

    expect((await token.balanceOf(instance.address)).toNumber()).to.be.equal(0);
    expect(await token.balanceOf(accounts[0])).to.be.deep.equal(initialSenderTokenBalance);

    expect(result.logs[0].event).to.be.equal('Refund');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(refundPreimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toNumber()).to.be.eq(swapAmount);
    expect(swapInfo[1]).to.be.equal(token.address);
    expect(swapInfo[2]).to.be.equal(claimAddress);
    expect(swapInfo[3]).to.be.equal(accounts[0]);
    expect(swapInfo[4].toNumber()).to.be.equal(timelock);
    expect(swapInfo[5]).to.be.false;

    // Test failure scenarios
    try {
      await instance.refund(refundPreimageHash);
      throw { reason: 'should not refund the same swap twice' };
    } catch (error) {
      expect(error.reason).to.be.equal('there is no pending swap with this preimage hash');
    }

    const timeoutRefundPreimageHash = bufferToBytes(crypto.sha256(randomBytes(32)));

    await token.increaseAllowance(instance.address, swapAmount);
    await instance.create(timeoutRefundPreimageHash, swapAmount, token.address, claimAddress, getEthereumTimestamp() + 60);

    try {
      await instance.refund(timeoutRefundPreimageHash);
      throw { reason: 'should not refund if the swap has not timed out yet' };
    } catch (error) {
      expect(error.reason).to.be.equal('swap has not timed out yet');
    }
  });
});
