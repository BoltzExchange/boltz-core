import { ECPair, crypto, address, Transaction } from 'bitcoinjs-lib';
import ChainClient from '../utils/ChainClient';
import { getHexBuffer } from '../../../lib/Utils';
import { RefundDetails, ClaimDetails } from '../../../lib/consts/Types';
import { Networks, swapScript, OutputType, detectSwap } from '../../../lib/Boltz';
import { p2wshOutput, p2shP2wshOutput, p2shOutput, p2wpkhOutput } from '../../../lib/swap/Scripts';

export const bitcoinClient = new ChainClient({
  host: '127.0.0.1',
  port: 18443,
  rpcuser: 'kek',
  rpcpass: 'kek',
});

export const claimDetails: ClaimDetails[] = [];
export const refundDetails: RefundDetails[] = [];

export const destinationOutput = p2wpkhOutput(
  crypto.hash160(
    ECPair.makeRandom({ network: Networks.bitcoinRegtest }).publicKey!,
  ),
);

describe('Swaps', () => {
  const claimKeys = ECPair.makeRandom({ network: Networks.bitcoinRegtest });
  const refundKeys = ECPair.makeRandom({ network: Networks.bitcoinRegtest });

  const preimage = getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c');
  const preimageHash = crypto.sha256(preimage);

  const sendFundsToSwap = async (outputFunction: (scriptHex: Buffer) => Buffer, outputType: OutputType) => {
    const { blocks } = await bitcoinClient.getBlockchainInfo();
    const timeoutBlockHeight = blocks + 1;

    const redeemScript = swapScript(preimageHash, claimKeys.publicKey!, refundKeys.publicKey!, timeoutBlockHeight);
    const swapAddress = address.fromOutputScript(outputFunction(redeemScript), Networks.bitcoinRegtest);

    const transactionId = await bitcoinClient.sendToAddress(swapAddress, 10000);
    const transaction = Transaction.fromHex(await bitcoinClient.getRawTransaction(transactionId) as string);

    const { vout, value, script } = detectSwap(redeemScript, transaction)!;

    return {
      redeemScript,
      timeoutBlockHeight,
      swapOutput: {
        vout,
        value,
        script,
        type: outputType,
        txHash: transaction.getHash(),
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

  beforeAll(async () => {
    await bitcoinClient.init();
  });

  test('should send funds to swaps', async () => {
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

    await bitcoinClient.generate(1);

    expect(claimDetails.length).toEqual(6);
    expect(refundDetails.length).toEqual(6);
  });
});
