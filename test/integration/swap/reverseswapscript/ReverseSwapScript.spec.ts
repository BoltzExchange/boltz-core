import { ECPair, crypto } from 'bitcoinjs-lib';
import { getHexBuffer } from '../../../../lib/Utils';
import { p2wshOutput } from '../../../../lib/swap/Scripts';
import { ClaimDetails, RefundDetails } from '../../../../lib/consts/Types';
import { Networks, reverseSwapScript, OutputType } from '../../../../lib/Boltz';
import { bitcoinClient, createSwapDetails, sendFundsToReedemScript } from '../Utils';

export let invalidPreimageLengthSwap: ClaimDetails;

export let claimDetails: ClaimDetails[] = [];
export let refundDetails: RefundDetails[] = [];

describe('ReverseSwapScript', () => {
  const claimKeys = ECPair.makeRandom({ network: Networks.bitcoinRegtest });
  const refundKeys = ECPair.makeRandom({ network: Networks.bitcoinRegtest });

  const invalidPreimage = getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c');
  const invalidPreimageHash = crypto.sha256(invalidPreimage);

  const preimage = getHexBuffer('9b2b702b8fd1cbd1375b3a63a840b8a02c318d93309e8df3203e120045dd0ae0');
  const preimageHash = crypto.sha256(preimage);

  beforeAll(async () => {
    await bitcoinClient.init();
  });

  test('should send funds to reverse swaps', async () => {
    const details = await createSwapDetails(
      reverseSwapScript,
      preimage,
      preimageHash,
      claimKeys,
      refundKeys,
    );

    const { blocks } = await bitcoinClient.getBlockchainInfo();
    const timeoutBlockHeight = blocks + 1;

    const redeemScript = reverseSwapScript(invalidPreimageHash, claimKeys.publicKey!, refundKeys.publicKey!, timeoutBlockHeight);

    const invalidOutput = await sendFundsToReedemScript(
      p2wshOutput,
      OutputType.Bech32,
      redeemScript,
      timeoutBlockHeight,
    );

    invalidPreimageLengthSwap = {
      redeemScript,
      keys: claimKeys,
      preimage: invalidPreimage,
      ...invalidOutput.swapOutput,
    };

    claimDetails = details.claimDetails;
    refundDetails = details.refundDetails;

    expect(claimDetails.length).toEqual(6);
    expect(refundDetails.length).toEqual(6);

    await bitcoinClient.generate(1);
  });
});
