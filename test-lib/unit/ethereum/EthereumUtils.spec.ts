import { fromEventAddress } from '../../../lib/ethereum/EthereumUtils';

describe('EthereumUtils', () => {
  test('should convert from event topic to checksum address', () => {
    expect(
      fromEventAddress('0x00000000000000000000000017ec8597ff92c3f44523bdc65bf0f1be632917ff')
    ).toEqual('0x17ec8597ff92C3F44523bDc65BF0f1bE632917ff');
  });
});
