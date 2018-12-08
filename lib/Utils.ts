/**
 * Get a hex encoded Buffer from a string
 * @returns a hex encoded Buffer
 */
export const getHexBuffer = (input: string) => {
  return Buffer.from(input, 'hex');
};

/**
 * Get a hex encoded string from a Buffer
 *
 * @returns a hex encoded string
 */
export const getHexString = (input: Buffer) => {
  return input.toString('hex');
};
