import { ECPair } from 'ecpair';
import { crypto } from 'liquidjs-lib';
import { getHexBuffer } from '../../../lib/Utils';
import { Networks, swapScript } from '../../../lib/Boltz';
import { bitcoinClient, createSwapDetails } from '../Utils';
import { RefundDetails, ClaimDetails } from '../../../lib/consts/Types';


export let claimDetails: ClaimDetails[] = [];
export let refundDetails: RefundDetails[] = [];

describe('SwapScript', () => {
  const claimKeys = ECPair.makeRandom({ network: Networks.liquidRegtest });
  const refundKeys = ECPair.makeRandom({ network: Networks.liquidRegtest });

  const preimage = getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c');
  const preimageHash = crypto.sha256(preimage);

  beforeAll(async () => {
    await bitcoinClient.init();
    await bitcoinClient.generate(1);
  });

  test('should send funds to swaps', async () => {
    const details = await createSwapDetails(
      swapScript,
      preimage,
      preimageHash,
      claimKeys,
      refundKeys,
    );

    claimDetails = details.claimDetails;
    refundDetails = details.refundDetails;


    expect(claimDetails.length).toEqual(6);
    expect(refundDetails.length).toEqual(6);

    await bitcoinClient.generate(1);
  });
});
