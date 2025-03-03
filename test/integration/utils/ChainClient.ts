import RpcClient from './RpcClient';

enum AddressType {
  Legacy = 'legacy',
  P2shegwit = 'p2sh-segwit',
  Bech32 = 'bech32',
  Taproot = 'bech32m',
}

type ChainConfig = {
  host: string;
  port: number;
  rpcuser: string;
  rpcpass: string;
};

type BlockchainInfo = {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  initialblockdownload: string;
  chainwork: string;
  size_on_disk: number;
  pruned: boolean;
};

type Block = {
  hash: string;
  confirmations: number;
  strippedsize: number;
  size: number;
  weight: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  tx: string[];
  time: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  nTx: number;
  previousblockhash: string;
};

class ChainClient {
  private miningAddress!: string;

  private static readonly decimals = 100000000;

  protected client: RpcClient;

  constructor(config: ChainConfig) {
    this.client = new RpcClient(config);
  }

  public init = async (): Promise<void> => {
    this.miningAddress = await this.getNewAddress();
    const { blocks } = await this.getBlockchainInfo();

    // If there are less than 101 blocks no coinbase outputs are spendable
    if (blocks < 101) {
      await this.generate(101 - blocks);
    }
  };

  public getBlockchainInfo = (): Promise<BlockchainInfo> => {
    return this.client.request<BlockchainInfo>('getblockchaininfo');
  };

  public getBlock = (hash: string): Promise<Block> => {
    return this.client.request<Block>('getblock', [hash]);
  };

  public sendRawTransaction = (rawTransaction: string): Promise<string> => {
    return this.client.request<string>('sendrawtransaction', [rawTransaction]);
  };

  public getRawTransaction = async (id: string): Promise<string> => {
    try {
      return await this.client.request<string>('getrawtransaction', [
        id,
        false,
      ]);
    } catch (e: any) {
      if (
        e.message !== undefined &&
        e.message ===
          'No such mempool or blockchain transaction. Use gettransaction for wallet transactions.'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return this.getRawTransaction(id);
      }

      throw e;
    }
  };

  public testMempoolAccept = (...txs: string[]) =>
    this.client.request<[{ allowed: boolean }]>('testmempoolaccept', [txs]);

  public getRawTransactionVerbose = (id: string) =>
    this.client.request<{
      vsize: number;
      discountvsize: number;
    }>('getrawtransaction', [id, true]);

  public getNewAddress = (type = AddressType.Bech32): Promise<string> => {
    return this.client.request<string>('getnewaddress', ['', type]);
  };

  public sendToAddress = (address: string, amount: number): Promise<string> => {
    return this.client.request<string>('sendtoaddress', [
      address,
      amount / ChainClient.decimals,
    ]);
  };

  public generate = async (blocks: number): Promise<string[]> => {
    return this.client.request<string[]>('generatetoaddress', [
      blocks,
      this.miningAddress,
    ]);
  };
}

export default ChainClient;
export { ChainConfig, AddressType };
