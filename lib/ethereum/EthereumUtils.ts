import { utils } from 'ethers';

/**
 * Event topics are always 32 bytes, so we need to trim the 24 leading zeros to get the 20 bytes address
 * @param topicAddress address from the topic of the transaction logs
 */
export const fromEventAddress = (topicAddress: string): string => {
  return utils.getAddress(`0x${topicAddress.slice(26)}`);
};
