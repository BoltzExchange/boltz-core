import chai from 'chai';
import { randomBytes } from 'crypto';
import { crypto } from 'bitcoinjs-lib';
import { BigNumber, constants } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import { Erc20Swap } from '../typechain/Erc20Swap';
import { Ierc20 as IERC20 } from '../typechain/Ierc20';
import BadERC20Artifact from '../artifacts/BadERC20.json';
import ERC20SwapArtifact from '../artifacts/ERC20Swap.json';
import TestERC20Artifact from '../artifacts/TestERC20.json';
import { checkContractEvent, expectInvalidDataLength, expectRevert, verifySwapEmpty } from './Utils';

chai.use(solidity);
const { expect } = chai;

describe('ERC20Swap', async () => {
  const provider = new MockProvider();
  const [senderWallet, claimWallet] = provider.getWallets();

  let preimage = randomBytes(32);
  let preimageHash = crypto.sha256(preimage);
  const lockupAmount = BigNumber.from(10).pow(18);

  let token: IERC20;
  let badToken: IERC20;

  let erc20Swap: Erc20Swap;

  const lockup = async (tokenAddress: string, locktime: number) => {
    return erc20Swap.lock(
      preimageHash,
      lockupAmount,
      tokenAddress,
      claimWallet.address,
      locktime,
    );
  };

  before(async () => {
    // The supply of the token is the lockup amount
    token = await deployContract(senderWallet, TestERC20Artifact, [lockupAmount]) as IERC20;
    badToken = await deployContract(senderWallet, BadERC20Artifact, [lockupAmount]) as IERC20;

    erc20Swap = await deployContract(senderWallet, ERC20SwapArtifact) as Erc20Swap;

    expect(token.address).to.properAddress;
    expect(erc20Swap.address).to.properAddress;
  });

  it('should not accept Ether', async () => {
    await expectRevert(senderWallet.sendTransaction({
      to: erc20Swap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should not lockup 0 value transactions', async () => {
    await expectRevert(erc20Swap.lock(
      preimageHash,
      0,
      token.address,
      senderWallet.address,
      await provider.getBlockNumber(),
    ), 'ERC20Swap: amount must not be zero');
  });

  it('should not lockup when ERC20 token cannot be transferred', async () => {
    await expectRevert(lockup(token.address, await provider.getBlockNumber()), 'ERC20Swap: could not transfer ERC20 tokens');
  });

  it('should lockup', async () => {
    // Set ERC20 token allowance
    await token.approve(erc20Swap.address, lockupAmount.toString());

    const locktime = await provider.getBlockNumber();

    const lockupTransaction = await lockup(token.address, locktime);
    const receipt = await lockupTransaction.wait(1);

    // Check the token balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![2], 'Lockup', preimageHash);

    // Make sure that the swaps map was populated with the supplied data
    const swap = await erc20Swap.swaps(preimageHash);

    expect(swap.amount).to.equal(lockupAmount);
    expect(swap.tokenAddress).to.equal(token.address);
    expect(swap.claimAddress).to.equal(claimWallet.address);
    expect(swap.refundAddress).to.equal(senderWallet.address);
    expect(swap.timelock).to.equal(locktime);
  });

  it('should not lockup multiple times with the same preimage hash', async () => {
    await expectRevert(lockup(token.address, await provider.getBlockNumber()), 'ERC20Swap: swap with preimage hash exists already');
  });

  it('should not claim with preimages that have a length unequal to 32', async () => {
    await expectInvalidDataLength(erc20Swap.claim(
      randomBytes(31),
    ));

    await expectInvalidDataLength(erc20Swap.claim(
      randomBytes(33),
    ));
  });

  it('should not claim with invalid preimages with the length of 32', async () => {
    await expectRevert(erc20Swap.claim(
      randomBytes(32),
    ), 'ERC20Swap: no swap with preimage hash');
  });

  it('should claim', async () => {
    const claimTransaction = await erc20Swap.claim(preimage);
    const receipt = await claimTransaction.wait(1);

    // Check the balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(0);

    // Check the balance of the claim address
    expect(await token.balanceOf(claimWallet.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![1], 'Claim', preimageHash, preimage);

    // Make sure that the swap was removed from the map
    verifySwapEmpty(await erc20Swap.swaps(preimageHash));

    // Send the claimed tokens back
    await token.connect(claimWallet).transfer(senderWallet.address, lockupAmount);
  });

  it('should not claim the same swap twice', async () => {
    await expectRevert(erc20Swap.claim(preimage), 'ERC20Swap: no swap with preimage hash');
  });

  it('should refund', async () => {
    // Set ERC20 token allowance
    await token.approve(erc20Swap.address, lockupAmount.toString());

    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    const locktime = (await provider.getBlockNumber()) + 2;
    await lockup(token.address, locktime);

    // Refund
    const refundTransaction = await erc20Swap.refund(preimageHash);
    const receipt = await refundTransaction.wait(1);

    // Check the balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(0);

    // Check the balance of the refund address
    expect(await token.balanceOf(senderWallet.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![1], 'Refund', preimageHash);

    // Make sure that the swap was removed from the map
    verifySwapEmpty(await erc20Swap.swaps(preimageHash));
  });

  it('should not refund the same swap twice', async () => {
    await expectRevert(erc20Swap.refund(preimageHash), 'ERC20Swap: no swap with preimage hash');
  });

  it('should not refund swaps that have not timed out yet', async () => {
    // Set ERC20 token allowance
    await token.approve(erc20Swap.address, lockupAmount.toString());

    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    // which means that refunds should fail if the swap expires in three blocks
    const locktime = (await provider.getBlockNumber()) + 3;
    await lockup(token.address, locktime);

    // Refund
    await expectRevert(erc20Swap.refund(preimageHash), 'ERC20Swap: swap has not timed out yet');
  });

  it('should handle bad ERC20 tokens', async () => {
    // Generate a new preimage and hash because the last test case left a pending Swap in the state
    preimage = randomBytes(32);
    preimageHash = crypto.sha256(preimage);

    // Approve and lockup the bad token
    await badToken.approve(erc20Swap.address, lockupAmount.toString());
    await lockup(badToken.address, await provider.getBlockNumber());

    // Check the balances to make sure tokens were transferred to the contract
    expect(await badToken.balanceOf(erc20Swap.address)).to.equal(lockupAmount);
    expect(await badToken.balanceOf(senderWallet.address)).to.equal(0);

    // Claim the bad token
    await erc20Swap.claim(preimage);

    // Check the balances again to make sure tokens were transferred to the claim address
    expect(await badToken.balanceOf(erc20Swap.address)).to.equal(0);
    expect(await badToken.balanceOf(claimWallet.address)).to.equal(lockupAmount);
  });
});
