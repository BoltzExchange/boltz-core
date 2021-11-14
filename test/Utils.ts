import { expect } from 'chai';
import { BigNumber, constants, Event, utils } from 'ethers';
import { getHexString } from '../lib/Utils';

/**
 * Event topics are always 32 bytes, so we need to trim the 24 leading zeros to get the 20 bytes address
 * @param topicAddress address from the topic of the transaction logs
 */
export const fromEventAddress = (topicAddress: string): string => {
  return utils.getAddress(`0x${topicAddress.slice(26)}`);
};


export const decodeBytes = (input: string) => {
  return input.slice(2);
};

export const expectRevert = async (promise: Promise<any>, reason?: string) => {
  let revert = false;

  try {
    await promise;
  } catch (error) {
    if (reason) {
      const stackTrace = (error as any).stackTrace;

      for (const trace of stackTrace) {
        if (trace.message) {
          const message = utils.toUtf8String(
            `0x${(trace.message.value as Buffer).toString('hex').substr(136)}`,
          ).substr(0, reason.length);

          expect(message).to.equal(reason);
        }
      }
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
    expect((error as any).reason).to.be.equal('incorrect data length');
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
