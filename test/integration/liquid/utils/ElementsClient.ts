import ChainClient from '../../utils/ChainClient';

class ElementsClient extends ChainClient {
  public dumpBlindingKey = (address: string): Promise<string> => {
    return this.client.request<string>('dumpblindingkey', [address]);
  };

  public getNewAddress = (): Promise<string> => {
    return this.client.request<string>('getnewaddress', ['', 'blech32']);
  };
}

export default ElementsClient;
