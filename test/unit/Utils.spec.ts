import {
  getHexBuffer,
  getHexString,
  hexToUint8Array,
  uint8ArrayEqual,
  uint8ArrayToHex,
} from '../../lib/Utils';

describe('Utils', () => {
  test('should get a hex encoded Buffers and strings', () => {
    const string = 'test';

    expect(getHexBuffer(string)).toEqual(Buffer.from(string, 'hex'));
    expect(getHexString(Buffer.from(string))).toEqual(
      Buffer.from(string).toString('hex'),
    );
  });

  test('should convert hex string to Uint8Array', () => {
    const hexString = '48656c6c6f';
    const expected = Buffer.from(hexString, 'hex');

    const result = hexToUint8Array(hexString);

    expect(Buffer.from(result)).toEqual(expected);
    expect(result.length).toEqual(5);
  });

  test('should throw error for odd-length hex string', () => {
    const oddLengthHex = '123';

    expect(() => hexToUint8Array(oddLengthHex)).toThrow(
      'hex string input length must be even',
    );
  });

  test('should throw error for invalid hex characters', () => {
    const invalidHex = '48656g6c';

    expect(() => hexToUint8Array(invalidHex)).toThrow(
      'invalid hex string at position 4',
    );
  });

  test('should throw error for non-hex characters at beginning', () => {
    const invalidHex = 'zz656c6c6f';

    expect(() => hexToUint8Array(invalidHex)).toThrow(
      'invalid hex string at position 0',
    );
  });

  test('should convert Uint8Array to hex string', () => {
    const hexString = '48656c6c6f';
    const bytes = Buffer.from(hexString, 'hex');

    const result = uint8ArrayToHex(bytes);

    expect(result).toEqual(hexString);
  });

  test('should handle zero-padded bytes in uint8ArrayToHex', () => {
    const hexString = '00010fff';
    const bytes = Buffer.from(hexString, 'hex');

    const result = uint8ArrayToHex(bytes);

    expect(result).toEqual(hexString);
  });

  test('should convert between hex and Uint8Array as inverse operations', () => {
    const originalHex = 'deadbeef';

    const bytes = hexToUint8Array(originalHex);
    const resultHex = uint8ArrayToHex(bytes);

    expect(resultHex).toEqual(originalHex);
  });

  test('should handle empty Uint8Array and hex string', () => {
    const emptyHex = '';
    const emptyBuffer = Buffer.from(emptyHex, 'hex');

    const result = hexToUint8Array(emptyHex);
    expect(Buffer.from(result)).toEqual(emptyBuffer);
    expect(uint8ArrayToHex(result)).toEqual(emptyHex);
  });

  test('should return true for equal Uint8Arrays', () => {
    const array1 = new Uint8Array([1, 2, 3, 4, 5]);
    const array2 = new Uint8Array([1, 2, 3, 4, 5]);

    expect(uint8ArrayEqual(array1, array2)).toBe(true);
  });

  test('should return true for empty Uint8Arrays', () => {
    const array1 = new Uint8Array([]);
    const array2 = new Uint8Array([]);

    expect(uint8ArrayEqual(array1, array2)).toBe(true);
  });

  test('should return false for arrays with different lengths', () => {
    const array1 = new Uint8Array([1, 2, 3]);
    const array2 = new Uint8Array([1, 2, 3, 4]);

    expect(uint8ArrayEqual(array1, array2)).toBe(false);
  });

  test('should return false for arrays with same length but different content', () => {
    const array1 = new Uint8Array([1, 2, 3, 4]);
    const array2 = new Uint8Array([1, 2, 5, 4]);

    expect(uint8ArrayEqual(array1, array2)).toBe(false);
  });

  test('should return false when arrays differ at the beginning', () => {
    const array1 = new Uint8Array([0xff, 2, 3, 4]);
    const array2 = new Uint8Array([0x00, 2, 3, 4]);

    expect(uint8ArrayEqual(array1, array2)).toBe(false);
  });

  test('should return false when arrays differ at the end', () => {
    const array1 = new Uint8Array([1, 2, 3, 0xff]);
    const array2 = new Uint8Array([1, 2, 3, 0x00]);

    expect(uint8ArrayEqual(array1, array2)).toBe(false);
  });

  test('should return true for same reference', () => {
    const array = new Uint8Array([1, 2, 3, 4, 5]);

    expect(uint8ArrayEqual(array, array)).toBe(true);
  });

  test('should handle Buffers as Uint8Arrays', () => {
    const buffer1 = Buffer.from('deadbeef', 'hex');
    const buffer2 = Buffer.from('deadbeef', 'hex');
    const buffer3 = Buffer.from('deadbeff', 'hex');

    expect(uint8ArrayEqual(buffer1, buffer2)).toBe(true);
    expect(uint8ArrayEqual(buffer1, buffer3)).toBe(false);
  });
});
