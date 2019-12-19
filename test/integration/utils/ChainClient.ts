import { Transaction } from 'bitcoinjs-lib';
import RpcClient from './RpcClient';
import { OutputType } from '../../../lib/Boltz';

type ChainConfig = {
  host: string;
  port: number;
  rpcuser: string;
  rpcpass: string;
};

type NetworkInfo = {
  version: number;
  subversion: string;
  protocolversion: number;
  localservices: number;
  localrelay: boolean;
  timeoffset: number;
  networkactive: boolean;
  connections: number;
  relayfee: number;
  incrementalfee: number;
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

type RawTransaction = {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: any[];
  vout: any[];
  hex: string;
  blockhash?: string;
  confirmations: number;
  time: number;
  blocktime: number;
};

interface ChainClient {
  on(event: 'block', listener: (height: number) => void): this;
  emit(event: 'block', height: number): boolean;

  on(event: 'transaction.relevant.mempool', listener: (transaction: Transaction) => void): this;
  emit(event: 'transaction.relevant.mempool', transaction: Transaction): boolean;

  on(event: 'transaction.relevant.block', listener: (transaction: Transaction) => void): this;
  emit(event: 'transaction.relevant.block', transaction: Transaction): boolean;
}

class ChainClient {
  private client: RpcClient;
  private miningAddress!: string;

  private static readonly decimals = 100000000;

  constructor(config: ChainConfig) {
    this.client = new RpcClient(config);
  }

  public init = async () => {
    this.miningAddress = await this.getNewAddress();
    const { blocks } = await this.getBlockchainInfo();

    // If there are less than 101 blocks no coinbase outputs are spendable
    if (blocks < 101) {
      await this.generate(101 - blocks);
    }
  }

  public getNetworkInfo = () => {
    return this.client.request<NetworkInfo>('getnetworkinfo');
  }

  public getBlockchainInfo = () => {
    return this.client.request<BlockchainInfo>('getblockchaininfo');
  }

  public getBlock = (hash: string): Promise<Block> => {
    return this.client.request<Block>('getblock', [hash]);
  }

  public sendRawTransaction = (rawTransaction: string) => {
    return this.client.request<string>('sendrawtransaction', [rawTransaction]);
  }

  /**
   * @param blockhash if provided Bitcoin Core will search for the transaction only in that block
   */
  public getRawTransaction = (id: string, verbose = false, blockhash?: string) => {
    return this.client.request<string | RawTransaction>('getrawtransaction', [id, verbose, blockhash]);
  }

  public estimateFee = async (confTarget = 2) => {
    const response = await this.client.request<any>('estimatesmartfee', [confTarget]);

    if (response.feerate) {
      const feePerKb = response.feerate * ChainClient.decimals;
      return Math.max(Math.round(feePerKb / 1000), 2);
    }

    return 2;
  }

  public getNewAddress = (type = OutputType.Bech32) => {
    const outputType = (() => {
      switch (type) {
        case OutputType.Bech32:
          return 'bech32';
        case OutputType.Compatibility:
          return 'p2sh-segwit';
        default:
          return 'legacy';
      }
    })();

    return this.client.request<string>('getnewaddress', ['', outputType]);
  }

  /**
   * @param amount in satoshis
   */
  public sendToAddress = (address: string, amount: number) => {
    return this.client.request<string>('sendtoaddress', [address, amount / ChainClient.decimals]);
  }

  public generate = async (blocks: number) => {
    return this.client.request<string[]>('generatetoaddress', [blocks, this.miningAddress]);
  }
}

export default ChainClient;
export { ChainConfig, RawTransaction };
