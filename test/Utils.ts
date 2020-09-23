import { expect } from 'chai';
import { BigNumber, constants, Event } from 'ethers';
import { getHexString } from '../lib/Utils';
import { fromEventAddress } from '../lib/ethereum/EthereumUtils';

export const decodeBytes = (input: string) => {
  return input.slice(2);
};

export const getFailureReason = (receipt: any) => {
  let results: object;

  if (receipt.results) {
    results = receipt.results;
  } else {
    results = receipt.error.results;
  }

  return Object.values(results)[0].reason;
};

export const expectRevert = async (promise: Promise<any>, reason?: string) => {
  let revert = false;

  try {
    await promise;
  } catch (error) {
    let results: object;

    if (error.results) {
      results = error.results;
    } else {
      results = error.error.results;
    }

    expect(Object.values(results)[0].error).to.equal('revert');

    if (reason) {
      expect(getFailureReason(error)).to.equal(reason);
    }

    revert = true;
  }

  expect(revert).to.be.true;
};

export const expectInvalidDataLength = async (promise: Promise<any>) => {
  let thrown = false;

  try {
    await promise;
  } catch (error) {
    expect(error.reason).to.be.equal('incorrect data length');
    thrown = true;
  }

  expect(thrown).to.be.true;
};

export const checkLockupEvent = (
  event: Event,
  preimageHash: Buffer,
  amount: BigNumber,
  claimAddress: string,
  refundAddress: string,
  timelock: number,
  tokenAddress?: string,
) => {
  expect(event.event).to.equal('Lockup');

  expect(decodeBytes(event.topics[1])).to.equal(getHexString(preimageHash));
  expect(fromEventAddress(event.topics[2])).to.equal(refundAddress);

  expect(decodeBytes(event.args!.preimageHash)).to.equal(getHexString(preimageHash));
  expect(event.args!.amount).to.equal(amount);
  expect(event.args!.claimAddress).to.equal(claimAddress);
  expect(event.args!.refundAddress).to.equal(refundAddress);
  expect(event.args!.timelock).to.equal(timelock);

  if (tokenAddress) {
    expect(event.args!.tokenAddress).to.equal(tokenAddress);
  }
};

export const checkContractEvent = (event: Event, name: string, preimageHash: Buffer, preimage?: Buffer) => {
  expect(event.event).to.equal(name);
  expect(decodeBytes(event.topics[1])).to.equal(getHexString(preimageHash));
  expect(decodeBytes(event.args!.preimageHash)).to.equal(getHexString(preimageHash));

  if (name === 'Claim') {
    expect(decodeBytes(event.args!.preimage)).to.equal(getHexString(preimage!));
  }
};

export const verifySwapEmpty = (swap: any) => {
  expect(swap.amount).to.equal(0);
  expect(swap.claimAddress).to.equal(constants.AddressZero);
  expect(swap.refundAddress).to.equal(constants.AddressZero);
  expect(swap.timelock).to.equal(0);

  // ERC20 swaps
  if (swap['erc20Token'] !== undefined) {
    expect(swap['erc20Token']).to.equal(constants.AddressZero);
  }
};
