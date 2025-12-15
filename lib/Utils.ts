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

/**
 * Get a Uint8Array from a hex encoded string
 *
 * @returns a Uint8Array
 */
export const hexToUint8Array = (input: string): Uint8Array => {
  if (input.length % 2 !== 0) {
    throw new Error('hex string input length must be even');
  }

  const bytes = new Uint8Array(input.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const hexPair = input.substring(i * 2, i * 2 + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(hexPair)) {
      throw new Error(`invalid hex string at position ${i * 2}`);
    }
    bytes[i] = parseInt(hexPair, 16);
  }

  return bytes;
};

/**
 * Get a hex encoded string from a Uint8Array
 *
 * @returns a hex encoded string
 */
export const uint8ArrayToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Compare two Uint8Array for equality
 *
 * @returns true if both arrays have exactly the same bytes, false otherwise
 */
export const uint8ArrayEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
};
