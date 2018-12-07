import { expect } from 'chai';
import * as utils from '../../lib/Utils';

describe('Utils', () => {
  it('should get a hex encoded Buffers and strings', () => {
    const string = 'test';

    expect(utils.getHexBuffer(string)).to.be.deep.equal(Buffer.from(string, 'hex'));
    expect(utils.getHexString(Buffer.from(string))).to.be.equal(Buffer.from(string).toString('hex'));
  });
});
