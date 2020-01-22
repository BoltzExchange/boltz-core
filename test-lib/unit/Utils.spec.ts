import * as utils from '../../lib/Utils';

describe('Utils', () => {
  test('should get a hex encoded Buffers and strings', () => {
    const string = 'test';

    expect(
      utils.getHexBuffer(string),
    ).toEqual(
      Buffer.from(string, 'hex'),
    );

    expect(
      utils.getHexString(Buffer.from(string)),
    ).toEqual(
      Buffer.from(string).toString('hex'),
    );
  });
});
