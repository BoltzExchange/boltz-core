import ChainClient from '../../utils/ChainClient';

class ElementsClient extends ChainClient {
  public dumpBlindingKey = (address: string): Promise<string> => {
    return this.client.request<string>('dumpblindingkey', [address]);
  };
}

export default ElementsClient;
