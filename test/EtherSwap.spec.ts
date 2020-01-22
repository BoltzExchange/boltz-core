import BN from 'bn.js';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { EtherSwapInstance } from '../types/truffle-contracts';
import { getHexString, bufferToBytes, getEthereumTimestamp } from '../lib/Utils';

const EtherSwap = artifacts.require('EtherSwap');

contract('EtherSwap', async (accounts) => {
  // Sample values
  const claimAddress = accounts[1];
  const timelock = getEthereumTimestamp();
  const swapAmount = web3.utils.toWei(new BN(1), 'ether');

  const preimage = randomBytes(32);
  const preimageHash = bufferToBytes(crypto.sha256(preimage));
  const preimageHashString = `0x${getHexString(crypto.sha256(preimage))}`;

  // Contract instances
  let instance: EtherSwapInstance;

  before(async () => {
    instance = await EtherSwap.new();
  });

  it('should create new swaps', async () => {
    const result = await instance.create.sendTransaction(
      preimageHash,
      claimAddress,
      timelock,
      {
        from: accounts[0],
        value: swapAmount,
      },
    ) as any as Truffle.TransactionResponse;

    expect(await web3.eth.getBalance(instance.address)).to.be.equal(swapAmount.toString());

    expect(result.logs[0].event).to.be.equal('Creation');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(preimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toString()).to.be.deep.equal(swapAmount.toString());
    expect(swapInfo[1]).to.be.equal(claimAddress);
    expect(swapInfo[2]).to.be.equal(accounts[0]);
    expect(swapInfo[3].toNumber()).to.be.equal(timelock);
    expect(swapInfo[4]).to.be.true;

    // Test failure scenarios
    const revertPreimageHash = bufferToBytes(crypto.sha256(randomBytes(32)));

    try {
      await instance.create.sendTransaction(
        revertPreimageHash,
        claimAddress,
        timelock,
        {
          value: new BN(0),
          from: accounts[0],
        },
      );
      throw { reason: 'should not create swaps with 0 amounts' };
    } catch (error) {
      expect(error.reason).to.be.equal('the amount must not be zero');
    }

    try {
      await instance.create.sendTransaction(
        preimageHash,
        claimAddress,
        timelock,
        {
          from: accounts[0],
          value: swapAmount,
        },
      );
      throw { reason: 'should not create two swaps with the same preimage hash' };
    } catch (error) {
      expect(error.reason).to.be.equal('a swap with this preimage hash exists already');
    }
  });

  it('should not claim swaps with preimages that have an invalid length', async () => {
    try {
      await instance.claim(preimageHash, bufferToBytes(randomBytes(64)));
      throw { reason: 'should not claim swaps with preimages that have an invalid length' };
    } catch (error) {
      expect(error.reason).to.be.equal('the preimage has to the have a length of 32 bytes');
    }
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
    const initialClaimBalance = new BN(await web3.eth.getBalance(claimAddress));

    const result = await instance.claim(preimageHash, bufferToBytes(preimage));

    expect(await web3.eth.getBalance(instance.address)).to.be.equal('0');
    expect(await web3.eth.getBalance(claimAddress)).to.be.equal(
      initialClaimBalance.add(swapAmount).toString(),
    );

    expect(result.logs[0].event).to.be.equal('Claim');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(preimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toString()).to.be.deep.equal(swapAmount.toString());
    expect(swapInfo[1]).to.be.equal(claimAddress);
    expect(swapInfo[2]).to.be.equal(accounts[0]);
    expect(swapInfo[3].toNumber()).to.be.equal(timelock);
    expect(swapInfo[4]).to.be.false;

    // // Test failure scenarios
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
    const refundPreimage = randomBytes(32);
    const refundPreimageHash = bufferToBytes(crypto.sha256(refundPreimage));
    const refundPreimageHashString = `0x${getHexString(crypto.sha256(refundPreimage))}`;

    await instance.create.sendTransaction(
      refundPreimageHash,
      claimAddress,
      timelock,
      {
        from: accounts[0],
        value: swapAmount,
      },
    );

    const initialSenderBalance = new BN(await web3.eth.getBalance(accounts[0]));

    const result = await instance.refund(refundPreimageHash, {
      // Send the transaction from another account to not affect the balance of accounts[0]
      from: accounts[3],
    });

    expect(await web3.eth.getBalance(instance.address)).to.be.equal('0');
    expect(await web3.eth.getBalance(accounts[0])).to.be.equal(
      initialSenderBalance.add(swapAmount).toString(),
    );

    expect(result.logs[0].event).to.be.equal('Refund');

    expect(result.logs[0].args.__length__).to.be.equal(1);
    expect(result.logs[0].args._preimageHash).to.be.equal(refundPreimageHashString);

    const swapInfo = await instance.swaps(preimageHash);

    expect(swapInfo[0].toString()).to.be.deep.equal(swapAmount.toString());
    expect(swapInfo[1]).to.be.equal(claimAddress);
    expect(swapInfo[2]).to.be.equal(accounts[0]);
    expect(swapInfo[3].toNumber()).to.be.equal(timelock);
    expect(swapInfo[4]).to.be.false;

    // // Test failure scenarios
    try {
      await instance.refund(refundPreimageHash);
      throw { reason: 'should not refund the same swap twice' };
    } catch (error) {
      expect(error.reason).to.be.equal('there is no pending swap with this preimage hash');
    }

    const timeoutRefundPreimageHash = bufferToBytes(crypto.sha256(randomBytes(32)));

    await instance.create.sendTransaction(
      timeoutRefundPreimageHash,
      claimAddress,
      getEthereumTimestamp() + 60,
      {
        from: accounts[0],
        value: swapAmount,
      },
    );

    try {
      await instance.refund(timeoutRefundPreimageHash);
      throw { reason: 'should not refund if the swap has not timed out yet' };
    } catch (error) {
      expect(error.reason).to.be.equal('swap has not timed out yet');
    }
  });
});
