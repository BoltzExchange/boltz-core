import type { AddressType } from '../../utils/ChainClient';
import ChainClient from '../../utils/ChainClient';

enum LiquidAddressType {
  Blech32 = 'blech32',
}

class ElementsClient extends ChainClient {
  public dumpBlindingKey = (address: string): Promise<string> => {
    return this.client.request<string>('dumpblindingkey', [address]);
  };

  public getNewAddress = (
    type: AddressType | LiquidAddressType = LiquidAddressType.Blech32,
  ): Promise<string> => {
    return this.client.request<string>('getnewaddress', ['', type]);
  };
}

export default ElementsClient;
export { LiquidAddressType };
