import chai from 'chai';
// @ts-ignore
import { ethers } from 'hardhat';
import { randomBytes } from 'crypto';
import { crypto } from 'liquidjs-lib';
import { solidity } from 'ethereum-waffle';
import { ERC20 } from '../typechain/ERC20';
import { ERC20Swap } from '../typechain/ERC20Swap';
import { BigNumber, constants, providers, Signer, utils } from 'ethers';
import { checkContractEvent, checkLockupEvent, expectInvalidDataLength, expectRevert } from './Utils';

chai.use(solidity);
const { expect } = chai;

describe('ERC20Swap', async () => {
  let provider: providers.Provider;

  let claimSigner: Signer;
  let claimAddress: string;

  let senderSigner: Signer;
  let senderAddress: string;

  const preimage = randomBytes(32);
  const preimageHash = crypto.sha256(preimage);
  const lockupAmount = BigNumber.from(10).pow(18);

  const tokenIssuance = lockupAmount.mul(2);

  let timelock: number;

  let token: ERC20;
  let badToken: ERC20;

  let erc20Swap: ERC20Swap;

  let lockupTransactionHash: string;

  const querySwap = async (tokenAddress: string) => {
    return erc20Swap.swaps(await erc20Swap.hashValues(
      preimageHash,
      lockupAmount,
      tokenAddress,
      claimAddress,
      senderAddress,
      timelock,
    ));
  };

  const lockup = async (tokenAddress: string) => {
    return erc20Swap.lock(
      preimageHash,
      lockupAmount,
      tokenAddress,
      claimAddress,
      timelock,
    );
  };

  before(async () => {
    const signers = await ethers.getSigners();

    provider = signers[0].provider!;

    senderSigner = signers[0];
    senderAddress = await senderSigner.getAddress();

    claimSigner = signers[1];
    claimAddress = await claimSigner.getAddress();

    token = await (await ethers.getContractFactory('TestERC20')).deploy('TestERC20', 'TRC', 18, tokenIssuance) as any as ERC20;
    badToken = await (await ethers.getContractFactory('BadERC20')).deploy('BadERC20', 'BAD', 18, tokenIssuance) as any as ERC20;

    erc20Swap = await (await ethers.getContractFactory('ERC20Swap')).deploy() as any as ERC20Swap;

    expect(token.address).to.be.properAddress;
    expect(badToken.address).to.be.properAddress;

    expect(erc20Swap.address).to.be.properAddress;
  });

  it('should have the correct version', async () => {
    expect(await erc20Swap.version()).to.be.equal(2);
  });

  it('should not accept Ether', async () => {
    await expectRevert(senderSigner.sendTransaction({
      to: erc20Swap.address,
      value: constants.WeiPerEther,
    }));
  });

  it('should hash swap values', async () => {
    timelock = await provider.getBlockNumber();

    expect(await erc20Swap.hashValues(
      preimageHash,
      lockupAmount,
      token.address,
      claimAddress,
      senderAddress,
      timelock,
    )).to.equal(utils.solidityKeccak256(
      ['bytes32', 'uint', 'address', 'address', 'address', 'uint'],
      [
        preimageHash,
        lockupAmount,
        token.address,
        claimAddress,
        senderAddress,
        timelock,
      ],
    ));
  });

  it('should not lockup 0 value transactions', async () => {
    await expectRevert(erc20Swap.lock(
      preimageHash,
      0,
      token.address,
      senderAddress,
      await provider.getBlockNumber(),
    ), 'ERC20Swap: locked amount must not be zero');
  });

  it('should not lockup when ERC20 token cannot be transferred', async () => {
    timelock = await provider.getBlockNumber();
    await expectRevert(lockup(token.address), 'TransferHelper: could not transferFrom ERC20 tokens');
  });

  it('should lockup', async () => {
    // Set ERC20 token allowance
    const approveTransaction = await token.approve(erc20Swap.address, lockupAmount);
    await approveTransaction.wait(1);

    timelock = await provider.getBlockNumber();

    const lockupTransaction = await lockup(token.address);
    lockupTransactionHash = lockupTransaction.hash;

    const receipt = await lockupTransaction.wait(1);

    // Check the token balance of the sender
    expect(await token.balanceOf(senderAddress)).to.equal(tokenIssuance.sub(lockupAmount));

    // Check the token balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkLockupEvent(
      receipt.events![2],
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
      token.address,
    );

    // Verify the swap was added to the mapping
    expect(await querySwap(token.address)).to.equal(true);
  });

  it('should query Swaps by refund address', async () => {
    const queriedEvents = await erc20Swap.queryFilter(
      erc20Swap.filters.Lockup(null, null, null, null, senderAddress, null),
    );

    expect(queriedEvents.length).to.equal(1);
    expect(queriedEvents[0].transactionHash).to.equal(lockupTransactionHash);
  });

  it('should not lockup multiple times with the same values', async () => {
    // Set ERC20 token allowance
    const approveTransaction = await token.approve(erc20Swap.address, lockupAmount);
    await approveTransaction.wait(1);

    await expectRevert(lockup(token.address), 'ERC20Swap: swap exists already');
  });

  it('should not claim with preimages that have a length unequal to 32', async () => {
    await expectInvalidDataLength(erc20Swap.claim(
      randomBytes(31),
      lockupAmount,
      token.address,
      senderAddress,
      timelock,
    ));

    await expectInvalidDataLength(erc20Swap.claim(
      randomBytes(33),
      lockupAmount,
      token.address,
      senderAddress,
      timelock,
    ));
  });

  it('should not claim with invalid preimages with the length of 32', async () => {
    await expectRevert(erc20Swap.claim(
      randomBytes(32),
      lockupAmount,
      token.address,
      senderAddress,
      timelock,
    ), 'ERC20Swap: swap has no tokens locked in the contract');
  });

  it('should claim', async () => {
    const claimTransaction = await erc20Swap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      token.address,
      senderAddress,
      timelock,
    );
    const receipt = await claimTransaction.wait(1);

    // Check the token balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(0);

    // Check the token balance of the claim address
    expect(await token.balanceOf(claimAddress)).to.equal(lockupAmount);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Claim', preimageHash, preimage);

    // Send the claimed ERC20 tokens back to the sender wallet
    await token.connect(claimSigner).transfer(senderAddress, lockupAmount);

    // Verify the swap was removed to the mapping
    expect(await querySwap(token.address)).to.equal(false);
  });

  it('should not claim the same swap twice', async () => {
    await expectRevert(erc20Swap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      token.address,
      senderAddress,
      timelock,
    ), 'ERC20Swap: swap has no tokens locked in the contract');
  });

  it('should refund', async () => {
    // Set ERC20 token allowance
    await token.approve(erc20Swap.address, lockupAmount);

    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    timelock = (await provider.getBlockNumber()) + 2;
    await lockup(token.address);

    // Refund
    const refundTransaction = await erc20Swap.refund(
      preimageHash,
      lockupAmount,
      token.address,
      claimAddress,
      timelock,
    );
    const receipt = await refundTransaction.wait(1);

    // Check the balance of the contract
    expect(await token.balanceOf(erc20Swap.address)).to.equal(0);

    // Check the balance of the refund address
    expect(await token.balanceOf(senderAddress)).to.equal(tokenIssuance);

    // Check the event emitted by the transaction
    checkContractEvent(receipt.events![0], 'Refund', preimageHash);

    // Verify the swap was removed to the mapping
    expect(await querySwap(token.address)).to.equal(false);
  });

  it('should not refund the same swap twice', async () => {
    await expectRevert(erc20Swap.refund(
      preimageHash,
      lockupAmount,
      token.address,
      claimAddress,
      timelock,
    ), 'ERC20Swap: swap has no tokens locked in the contract');
  });

  it('should not refund swaps that have not timed out yet', async () => {
    // Set ERC20 token allowance
    await token.approve(erc20Swap.address, lockupAmount.toString());

    // Lockup again to have a swap that can be refunded
    // A block is mined for the lockup transaction and therefore the refund is included in two blocks
    // which means that refunds should fail if the swap expires in three blocks
    timelock = (await provider.getBlockNumber()) + 3;
    await lockup(token.address);

    // Refund
    await expectRevert(erc20Swap.refund(
      preimageHash,
      lockupAmount,
      token.address,
      claimAddress,
      timelock,
    ), 'ERC20Swap: swap has not timed out yet');
  });

  it('should handle bad ERC20 tokens', async () => {
    // Approve and lockup the bad token
    await badToken.approve(erc20Swap.address, lockupAmount.toString());

    timelock = await provider.getBlockNumber();
    await lockup(badToken.address);

    // Check the balances to make sure tokens were transferred to the contract
    expect(await badToken.balanceOf(erc20Swap.address)).to.equal(lockupAmount);
    expect(await badToken.balanceOf(senderAddress)).to.equal(tokenIssuance.sub(lockupAmount));

    // Claim the bad token
    const claimTransaction = await erc20Swap.connect(claimSigner).claim(
      preimage,
      lockupAmount,
      badToken.address,
      senderAddress,
      timelock,
    );
    await claimTransaction.wait(1);

    // Check the balances again to make sure tokens were transferred to the claim address
    expect(await badToken.balanceOf(erc20Swap.address)).to.equal(0);
    expect(await badToken.balanceOf(claimAddress)).to.equal(lockupAmount);
  });

  it('should lockup with prepay miner fee', async () => {
    const approveTransaction = await token.approve(erc20Swap.address, lockupAmount);
    await approveTransaction.wait(1);

    const claimBalanceBefore = await provider.getBalance(claimAddress);

    timelock = await provider.getBlockNumber();

    const prepayAmount = BigNumber.from(1);

    const lockupTransaction = await erc20Swap.lockPrepayMinerfee(
      preimageHash,
      lockupAmount,
      token.address,
      claimAddress,
      timelock,
      {
        value: prepayAmount,
      }
    );

    const receipt = await lockupTransaction.wait(1);

    expect(await provider.getBalance(claimAddress)).to.equal(claimBalanceBefore.add(prepayAmount));

    checkLockupEvent(
      receipt.events![2],
      preimageHash,
      lockupAmount,
      claimAddress,
      senderAddress,
      timelock,
      token.address,
    );

    expect(await querySwap(token.address)).to.equal(true);
  });
});
