import { getHexBuffer, getHexString } from '../../lib/Utils';

describe('Utils', () => {
  test('should get a hex encoded Buffers and strings', () => {
    const string = 'test';

    expect(getHexBuffer(string)).toEqual(Buffer.from(string, 'hex'));
    expect(getHexString(Buffer.from(string))).toEqual(
      Buffer.from(string).toString('hex'),
    );
  });
});
