import chai from 'chai';
import { constants } from 'ethers';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import { EtherSwap } from '../typechain/EtherSwap';
import EtherSwapArtifact from '../artifacts/EtherSwap.json';
import { checkContractEvent, expectInvalidDataLength, expectRevert, verifySwapEmpty } from './Utils';

chai.use(solidity);
const { expect } = chai;

describe('EtherSwap', async () => {
  const provider = new MockProvider();
  const [wallet] = provider.getWallets();

  const preimage = randomBytes(32);
  const preimageHash = crypto.sha256(preimage);
  const claimAddress = '0xAFcb428385cFEe89Be8DcBA21B534F28c303C863';
  const lockupAmount = constants.WeiPerEther;

  let etherSwap: EtherSwap;

  const lockup = async (locktime: number) => {
    return etherSwap.lock(
      preimageHash,
      claimAddress,
      locktime,
      {
        value: lockupAmount,
      },
    );
  };

  before(async () => {
    etherSwap = await deployContract(wallet, EtherSwapArtifact) as EtherSwap;

    expect(etherSwap.address).to.properAddress;
  });

  it('should not accept Ether without function signature', async () => {
    await expectRevert(wallet.sendTransaction({
      to: etherSwap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should not lockup 0 value transactions', async () => {
    await expectRevert(etherSwap.lock(
      preimageHash,
      claimAddress,
      await provider.getBlockNumber(),
    ), 'EtherSwap: amount must not be zero');
  });

  it('should lockup', async () => {
    const locktime = await provider.getBlockNumber();

    const lockupTransaction = await lockup(locktime);
    const receipt = await lockupTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Lockup', preimageHash);

    // Make sure that the swaps map was populated with the supplied data
    const swap = await etherSwap.swaps(preimageHash);

    expect(swap.amount).to.equal(lockupAmount);
    expect(swap.claimAddress).to.equal(claimAddress);
    expect(swap.refundAddress).to.equal(wallet.address);
    expect(swap.timelock).to.equal(locktime);
  });

  it('should not lockup multiple times with the same preimage hash', async () => {
    await expectRevert(lockup(await provider.getBlockNumber()), 'EtherSwap: swap with preimage hash exists already');
  });

  it('should not claim with preimages that have a length unequal to 32', async () => {
    await expectInvalidDataLength(etherSwap.claim(
      randomBytes(31),
    ));

    await expectInvalidDataLength(etherSwap.claim(
      randomBytes(33),
    ));
  });

  it('should not claim with invalid preimages with the length of 32', async () => {
    await expectRevert(etherSwap.claim(
      randomBytes(32),
    ), 'EtherSwap: no swap with preimage hash');
  });

  it('should claim', async () => {
    const claimTransaction = await etherSwap.claim(preimage);
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the claim address
    expect(await provider.getBalance(claimAddress)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    // Make sure that the swap was removed from the map
    verifySwapEmpty(await etherSwap.swaps(preimageHash));
  });

  it('should not claim the same swap twice', async () => {
    await expectRevert(etherSwap.claim(preimage), 'EtherSwap: no swap with preimage hash');
  });

  it('should refund', async () => {
    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    const locktime = (await provider.getBlockNumber()) + 2;
    await lockup(locktime);

    // Refund
    const balanceBeforeRefund = await provider.getBalance(wallet.address);

    const refundTransaction = await etherSwap.refund(preimageHash);
    const receipt = await refundTransaction.wait(1);

    // Check the balance of the contract
    expect(await provider.getBalance(etherSwap.address)).to.equal(0);

    // Check the balance of the refund address
    expect(await provider.getBalance(wallet.address)).to.equal(
      // Subtract the Ether spent on gas
      balanceBeforeRefund.add(lockupAmount).sub(refundTransaction.gasPrice.mul(receipt.cumulativeGasUsed)),
    );

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Refund', preimageHash);

    // Make sure that the swap was removed from the map
    verifySwapEmpty(await etherSwap.swaps(preimageHash));
  });

  it('should not refund the same swap twice', async () => {
    await expectRevert(etherSwap.refund(preimageHash), 'EtherSwap: no swap with preimage hash');
  });

  it('should not refund swaps that have not timed out yet', async () => {
    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    // which means that refunds should fail if the swap expires in three blocks
    const locktime = (await provider.getBlockNumber()) + 3;
    await lockup(locktime);

    // Refund
    await expectRevert(etherSwap.refund(preimageHash), 'EtherSwap: swap has not timed out yet');
  });
});
