/**
 * Get a hex encoded Buffer from a string
 *
 * @returns a hex encoded Buffer
 */
export const getHexBuffer = (input: string): Buffer => {
  return Buffer.from(input, 'hex');
};

/**
 * Get a hex encoded string from a Buffer
 *
 * @returns a hex encoded string
 */
export const getHexString = (input: Buffer): string => {
  return input.toString('hex');
};
