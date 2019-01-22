import { ECPair, crypto, Transaction, TransactionBuilder } from 'bitcoinjs-lib';
import BtcdClient from './BtcdClient';
import { Networks } from '../../../../lib/Boltz';
import { p2pkhOutput } from '../../../../lib/swap/Scripts';

type Utxo = {
  hash: string;
  vout: number;
  value: number;
};

export class UtxoManager {
  public static keys = ECPair.fromWIF('FpE6z8Fnv471mwuBbgQB9EfZgJPDQpxw3TqyM4kxDWAhCN752FVo', Networks.bitcoinSimnet);
  public static outputScript = p2pkhOutput(crypto.hash160(UtxoManager.keys.publicKey));

  private utxo!: Utxo;

  constructor(private btcd: BtcdClient) {}

  public init = async () => {
    // Mine 433 blocks to activate SegWit on the simnet chain
    const blockHashes = await this.btcd.generate(433);
    const firstBlock = await this.btcd.getBlock(blockHashes[0]);

    const coinbase = Transaction.fromHex(
      await this.btcd.getRawTransaction(firstBlock.tx[0]),
    );

    this.utxo = {
      hash: coinbase.getId(),
      vout: 0,
      value: coinbase.outs[0].value,
    };
  }

  public constructTransaction = (destination: string | Buffer, value: number): Transaction => {
    const tx = new TransactionBuilder(Networks.bitcoinSimnet);

    tx.addInput(this.utxo.hash, this.utxo.vout);

    tx.addOutput(destination, value);

    // Calculate and add change
    const utxoValue = (this.utxo.value - value) - 1000;
    tx.addOutput(UtxoManager.outputScript, utxoValue);

    tx.sign(0, UtxoManager.keys);

    const transaction = tx.build();

    this.utxo = {
      hash: transaction.getId(),
      vout: 1,
      value: utxoValue,
    };

    return transaction;
  }

  public broadcastAndMine = async (txHex: string) => {
    await this.btcd.sendRawTransaction(txHex);
    await this.btcd.generate(1);
  }
}
