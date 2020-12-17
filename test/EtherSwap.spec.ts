import chai from 'chai';
// @ts-ignore
import { ethers } from 'hardhat';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { solidity } from 'ethereum-waffle';
import { Signer, providers, constants, utils, BigNumber } from 'ethers';
import { EtherSwap } from '../typechain/EtherSwap';
import { checkContractEvent, checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  let provider: providers.Provider;

  let claimSigner: Signer;
  let claimAddress: string;

  let senderSigner: Signer;
  let senderAddress: string;

  const preimage = randomBytes(32);
  const preimageHash = crypto.sha256(preimage);
  const lockupAmount = constants.WeiPerEther;

  let timelock: number;

  let etherSwap: EtherSwap;

  let lockupTransactionHash: string;

  const querySwap = () => {
    return etherSwap.swaps(utils.solidityKeccak256(
      ['bytes32', 'uint', 'address', 'address', 'uint'],
      [
        preimageHash,
        lockupAmount,
        claimAddress,
        senderAddress,
        timelock,
      ],
    ));
  };

  const lockup = async () => {
    return etherSwap.lock(
      preimageHash,
      claimAddress,
      timelock,
      {
        value: lockupAmount,
      },
    );
  };

  before(async () => {
    const signers = await ethers.getSigners();

    provider = signers[0].provider!;

    senderSigner = signers[0];
    senderAddress = await senderSigner.getAddress();

    claimSigner = signers[1];
    claimAddress = await claimSigner.getAddress();

    etherSwap = await (await ethers.getContractFactory('EtherSwap')).deploy() as any as EtherSwap;

    expect(etherSwap.address).to.be.properAddress;
  });

  it('should have the correct version', async () => {
    expect(await etherSwap.version()).to.be.equal(2);
  });

  it('should not accept Ether without function signature', async () => {
    await expectRevert(senderSigner.sendTransaction({
      to: etherSwap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should not lockup 0 value transactions', async () => {
    await expectRevert(etherSwap.lock(
      preimageHash,
      claimAddress,
      await provider.getBlockNumber(),
    ), 'EtherSwap: locked amount must not be zero');
  });

  it('should lockup', async () => {
    timelock = await provider.getBlockNumber();

    const lockupTransaction = await lockup();
    lockupTransactionHash = lockupTransaction.hash;

    const receipt = await lockupTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkLockupEvent(
      receipt.events![0],
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
    );

    // Verify the swap was added to the mapping
    expect(await querySwap()).to.equal(true);
  });

  it('should query Swaps by refund address', async () => {
    const queriedEvents = await etherSwap.queryFilter(
      etherSwap.filters.Lockup(null, null, null, senderAddress, null),
    );

    expect(queriedEvents.length).to.equal(1);
    expect(queriedEvents[0].transactionHash).to.equal(lockupTransactionHash);
  });

  it('should not lockup multiple times with the same values', async () => {
    await expectRevert(lockup(), 'EtherSwap: swap exists already');
  });

  it('should not claim with preimages that have a length unequal to 32', async () => {
    await expectInvalidDataLength(etherSwap.claim(
      randomBytes(31),
      lockupAmount,
      senderAddress,
      timelock,
    ));

    await expectInvalidDataLength(etherSwap.claim(
      randomBytes(33),
      lockupAmount,
      senderAddress,
      timelock,
    ));
  });

  it('should not claim with invalid preimages with the length of 32', async () => {
    await expectRevert(etherSwap.claim(
      randomBytes(32),
      lockupAmount,
      senderAddress,
      timelock,
    ), 'EtherSwap: swap has no Ether locked in the contract');
  });

  it('should claim', async () => {
    const balanceBeforeClaim = await provider.getBalance(claimAddress);

    const claimTransaction = await etherSwap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      senderAddress,
      timelock,
    );
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the claim address
    expect(await provider.getBalance(claimAddress)).to.equal(
      balanceBeforeClaim.add(lockupAmount).sub(claimTransaction.gasPrice.mul(receipt.cumulativeGasUsed)),
    );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    // Verify the swap was removed to the mapping
    expect(await querySwap()).to.equal(false);
  });

  it('should not claim the same swap twice', async () => {
    await expectRevert(etherSwap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      senderAddress,
      timelock,
    ), 'EtherSwap: swap has no Ether locked in the contract');
  });

  it('should refund', async () => {
    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    timelock = (await provider.getBlockNumber()) + 2;
    await lockup();

    const balanceBeforeRefund = await provider.getBalance(senderAddress);

    // Do the refund
    const refundTransaction = await etherSwap.refund(
      preimageHash,
      lockupAmount,
      claimAddress,
      timelock,
    );
    const receipt = await refundTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the refund address
    expect(await provider.getBalance(senderAddress)).to.equal(
      balanceBeforeRefund.add(lockupAmount).sub(refundTransaction.gasPrice.mul(receipt.cumulativeGasUsed)),
    );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Refund', preimageHash);

    // Verify the swap was removed to the mapping
    expect(await querySwap()).to.equal(false);
  });

  it('should not refund the same swap twice', async () => {
    await expectRevert(etherSwap.refund(
      preimageHash,
      lockupAmount,
      claimAddress,
      timelock,
    ), 'EtherSwap: swap has no Ether locked in the contract');
  });

  it('should not refund swaps that have not timed out yet', async () => {
    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    // which means that refunds should fail if the swap expires in three blocks
    timelock = (await provider.getBlockNumber()) + 3;
    await lockup();

    // Refund
    await expectRevert(etherSwap.refund(
      preimageHash,
      lockupAmount,
      claimAddress,
      timelock,
    ), 'EtherSwap: swap has not timed out yet');
  });

  it('should lockup with prepay miner fee', async () => {
    timelock = await provider.getBlockNumber();

    const contractBalanceBefore = await provider.getBalance(etherSwap.address);
    const claimBalanceBefore = await provider.getBalance(claimAddress);

    const prepayAmount = BigNumber.from(1);

    const lockupTransaction = await etherSwap.lockPrepayMinerfee(
      preimageHash,
      claimAddress,
      timelock,
      prepayAmount,
      {
        value: lockupAmount.add(prepayAmount),
      },
    );

    const receipt = await lockupTransaction.wait(1);

    expect(await provider.getBalance(etherSwap.address)).to.equal(contractBalanceBefore.add(lockupAmount));
    expect(await provider.getBalance(claimAddress)).to.equal(claimBalanceBefore.add(prepayAmount));

    checkLockupEvent(
      receipt.events![0],
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
    );

    expect(await querySwap()).to.equal(true);
  });

  it('should not lockup with prepay miner fee if the prepay amount is greater than the value', async () => {
    await expectRevert(etherSwap.lockPrepayMinerfee(
      preimageHash,
      claimAddress,
      timelock,
      BigNumber.from(2),
      {
        value: BigNumber.from(1),
      },
    ), 'EtherSwap: sent amount must be greater than the prepay amount');
  });

  it('should not lockup with prepay miner fee if the prepay amount is equal to the value', async () => {
    await expectRevert(etherSwap.lockPrepayMinerfee(
      preimageHash,
      claimAddress,
      timelock,
      BigNumber.from(1),
      {
        value: BigNumber.from(1),
      },
    ), 'EtherSwap: sent amount must be greater than the prepay amount');
  });
});
