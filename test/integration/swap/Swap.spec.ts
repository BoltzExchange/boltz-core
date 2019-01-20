import { expect } from 'chai';
import { ECPair, crypto } from 'bitcoinjs-lib';
import BtcdClient from './utils/BtcdClient';
import { UtxoManager } from './utils/UtxoManager';
import { getHexBuffer } from '../../../lib/Utils';
import { Networks, swapScript, OutputType } from '../../../lib/Boltz';
import { RefundDetails, ClaimDetails } from '../../../lib/consts/Types';
import { p2wshOutput, p2shP2wshOutput, p2shOutput } from '../../../lib/swap/Scripts';

export const claimKeys = ECPair.makeRandom({ network: Networks.bitcoinSimnet });
export const refundKeys = ECPair.makeRandom({ network: Networks.bitcoinSimnet });

export const btcd = new BtcdClient();

export const claimDetails: ClaimDetails[] = [];
export const refundDetails: RefundDetails[] = [];

describe('Swaps', () => {
  const utxoManager = new UtxoManager(btcd);

  const preimage = getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c');

  const sendFundsToSwap = async (outputFunction: (scriptHex: Buffer) => Buffer, outputType: OutputType) => {
    const { height } = await btcd.getBestBlock();
    const timeoutBlockHeight = height + 1;

    const redeemScript = swapScript(crypto.sha256(preimage), claimKeys.publicKey, refundKeys.publicKey, timeoutBlockHeight);
    const outputScript = outputFunction(redeemScript);

    const transaction = utxoManager.constructTransaction(outputScript, 100000);
    await btcd.sendRawTransaction(transaction.toHex());

    const swapVout = 0;
    const transactionOutput = transaction.outs[swapVout];

    return {
      redeemScript,
      timeoutBlockHeight,
      swapOutput: {
        txHash: transaction.getHash(),
        vout: swapVout,
        type: outputType,
        script: transactionOutput.script,
        value: transactionOutput.value,
      },
    };
  };

  const createOutputs = async () => {
    return [
      await sendFundsToSwap(p2wshOutput, OutputType.Bech32),
      await sendFundsToSwap(p2shOutput, OutputType.Legacy),
      await sendFundsToSwap(p2shP2wshOutput, OutputType.Compatibility),
    ];
  };

  before(async () => {
    await btcd.connect();
    await utxoManager.init();
  });

  it('should send funds to swaps', async () => {
    for (let i = 0; i < 2; i += 1) {
      const claimOutputs = await createOutputs();

      claimOutputs.forEach((out) => {
        claimDetails.push({
          preimage,
          keys: claimKeys,
          redeemScript: out.redeemScript,
          ...out.swapOutput,
        });
      });

      const refundOutputs = await createOutputs();

      refundOutputs.forEach((out) => {
        refundDetails.push({
          keys: refundKeys,
          redeemScript: out.redeemScript,
          ...out.swapOutput,
        });
      });
    }

    await btcd.generate(1);

    expect(claimDetails.length).to.be.equal(6);
    expect(refundDetails.length).to.be.equal(6);
  });

  after(() => {
    btcd.disconnect();
  });
});
