import RpcClient from './RpcClient';

type BestBlock = {
  hash: string,
  height: number,
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
  previousblockhash: string;
  nextblockhash: string;
};

class BtcdClient {
  private rpcClient: RpcClient;

  constructor() {
    this.rpcClient = new RpcClient();
    this.bindWs();
  }

  private bindWs = () => {
    this.rpcClient.on('error', (error) => { throw(error); });
  }

  public connect = async () => {
    await this.rpcClient.connect();
  }

  public disconnect = async () => {
    await this.rpcClient.close();
  }

  public getBestBlock = (): Promise<BestBlock> => {
    return this.rpcClient.call<BestBlock>('getbestblock');
  }

  public getBlock = (blockHash: string): Promise<Block> => {
    return this.rpcClient.call<Block>('getblock', blockHash);
  }

  public loadTxFiler = (reload: boolean, addresses: string[], outpoints: string[]): Promise<null> => {
    // tslint:disable-next-line no-null-keyword
    return this.rpcClient.call<null>('loadtxfilter', reload, addresses, outpoints);
  }

  public sendRawTransaction = (rawTransaction: string, allowHighFees = true): Promise<string> => {
    return this.rpcClient.call<string>('sendrawtransaction', rawTransaction, allowHighFees);
  }

  public getRawTransaction = (transactionHash: string, verbose = 0) => {
    return this.rpcClient.call<any>('getrawtransaction', transactionHash, verbose);
  }

  public generate = (blocks: number): Promise<string[]> => {
    return this.rpcClient.call<string[]>('generate', blocks);
  }
}

export default BtcdClient;
