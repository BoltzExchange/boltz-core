import chai from 'chai';
import { constants, utils } from 'ethers';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import { EtherSwap } from '../typechain/EtherSwap';
import EtherSwapArtifact from '../artifacts/EtherSwap.json';
import { checkContractEvent, checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  const provider = new MockProvider();
  const [senderWallet, claimWallet] = provider.getWallets();

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
        claimWallet.address,
        senderWallet.address,
        timelock,
      ],
    ));
  };

  const lockup = async () => {
    return etherSwap.lock(
      preimageHash,
      claimWallet.address,
      timelock,
      {
        value: lockupAmount,
      },
    );
  };

  before(async () => {
    etherSwap = await deployContract(senderWallet, EtherSwapArtifact) as any as EtherSwap;

    expect(etherSwap.address).to.be.properAddress;
  });

  it('should have the correct version', async () => {
    expect(await etherSwap.version()).to.be.equal(1);
  });

  it('should not accept Ether without function signature', async () => {
    await expectRevert(senderWallet.sendTransaction({
      to: etherSwap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should not lockup 0 value transactions', async () => {
    await expectRevert(etherSwap.lock(
      preimageHash,
      claimWallet.address,
      await provider.getBlockNumber(),
    ), 'EtherSwap: amount must not be zero');
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
      claimWallet.address,
      senderWallet.address,
      timelock,
    );

    // Verify the swap was added to the mapping
    expect(await querySwap()).to.equal(true);
  });

  it('should query Swaps by refund address', async () => {
    const queriedEvents = await etherSwap.queryFilter(
      etherSwap.filters.Lockup(null, null, null, senderWallet.address, null),
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
      senderWallet.address,
      timelock,
    ));

    await expectInvalidDataLength(etherSwap.claim(
      randomBytes(33),
      lockupAmount,
      senderWallet.address,
      timelock,
    ));
  });

  it('should not claim with invalid preimages with the length of 32', async () => {
    await expectRevert(etherSwap.claim(
      randomBytes(32),
      lockupAmount,
      senderWallet.address,
      timelock,
    ), 'EtherSwap: swap does not exist');
  });

  it('should claim', async () => {
    const balanceBeforeClaim = await provider.getBalance(claimWallet.address);

    const claimTransaction = await etherSwap.connect(claimWallet).claim(
      preimage,
      lockupAmount,
      senderWallet.address,
      timelock,
    );
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the claim address
    expect(await provider.getBalance(claimWallet.address)).to.equal(
      balanceBeforeClaim.add(lockupAmount).sub(claimTransaction.gasPrice.mul(receipt.cumulativeGasUsed)),
    );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    // Verify the swap was removed to the mapping
    expect(await querySwap()).to.equal(false);
  });

  it('should not claim the same swap twice', async () => {
    await expectRevert(etherSwap.connect(claimWallet).claim(
      preimage,
      lockupAmount,
      senderWallet.address,
      timelock,
    ), 'EtherSwap: swap does not exist');
  });

  it('should refund', async () => {
    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    timelock = (await provider.getBlockNumber()) + 2;
    await lockup();

    const balanceBeforeRefund = await provider.getBalance(senderWallet.address);

    // Do the refund
    const refundTransaction = await etherSwap.refund(
      preimageHash,
      lockupAmount,
      claimWallet.address,
      timelock,
    );
    const receipt = await refundTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the refund address
    expect(await provider.getBalance(senderWallet.address)).to.equal(
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
      claimWallet.address,
      timelock,
    ), 'EtherSwap: swap does not exist');
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
      claimWallet.address,
      timelock,
    ), 'EtherSwap: swap has not timed out yet');
  });
});
