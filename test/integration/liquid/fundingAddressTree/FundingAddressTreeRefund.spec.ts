import { secp256k1 } from '@noble/curves/secp256k1';
import zkp, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { Transaction, address } from 'liquidjs-lib';
import { detectSwap, fundingAddressTree } from '../../../../lib/Boltz';
import { OutputType } from '../../../../lib/consts/Enums';
import type { FundingAddressTree } from '../../../../lib/consts/Types';
import {
  Networks as LiquidNetworks,
  type LiquidRefundDetails,
  init,
} from '../../../../lib/liquid';
import { secp } from '../../../../lib/liquid/init';
import {
  tapTweakHash,
  toHashTree,
} from '../../../../lib/liquid/swap/TaprootUtils';
import { p2trOutput } from '../../../../lib/swap/Scripts';
import { toXOnly } from '../../../../lib/swap/TaprootUtils';
import { slip77 } from '../../../unit/Utils';
import {
  blindWitnessAddress,
  destinationOutput,
  elementsClient,
  generateKeys,
  refundSwap,
  init as utilsInit,
} from '../../Utils';

let secpZkp: Secp256k1ZKP;

const initSecpZkp = async () => {
  if (secpZkp) {
    return secpZkp;
  }

  secpZkp = await zkp();
  return secpZkp;
};

const createFundingAddressOutput = async (
  timeoutBlockHeight: number,
  confidential: boolean,
): Promise<{
  utxo: LiquidRefundDetails;
  refundKeys: Uint8Array;
}> => {
  const refundKeys = generateKeys();
  const refundPubKey = secp256k1.getPublicKey(refundKeys);

  const tree: FundingAddressTree = fundingAddressTree(
    true,
    refundPubKey,
    timeoutBlockHeight,
  );

  const internalKey = Buffer.from(
    toXOnly(secp256k1.getPublicKey(generateKeys())),
  );
  const treeHash = toHashTree(tree.tree).hash;
  const tweakResult = secp.ecc.xOnlyPointAddTweak(
    internalKey,
    tapTweakHash(internalKey, treeHash),
  )!;
  const tweakedPubKey = tweakResult.xOnlyPubkey;

  const outputScript = p2trOutput(tweakedPubKey);
  let swapAddress = address.fromOutputScript(
    Buffer.from(outputScript),
    LiquidNetworks.liquidRegtest,
  );

  let blindingPrivateKey: Buffer | undefined;

  if (confidential) {
    const enc = blindWitnessAddress(swapAddress, OutputType.Taproot);
    swapAddress = enc.address;
    blindingPrivateKey = enc.blindingKey.privateKey;
  }

  const transactionId = await elementsClient.sendToAddress(swapAddress, 10000);
  const txHex = await elementsClient.getRawTransaction(transactionId);
  const transaction = Transaction.fromHex(txHex);

  const detected = detectSwap(tweakedPubKey, transaction)!;

  const utxo = {
    ...detected,
    internalKey,
    transactionId,
    blindingPrivateKey,
    swapTree: tree,
    privateKey: refundKeys,
    type: OutputType.Taproot,
  } as LiquidRefundDetails;

  return {
    utxo,
    refundKeys,
  };
};

describe.each`
  blindInputs | blindOutput
  ${false}    | ${false}
  ${false}    | ${true}
  ${true}     | ${false}
  ${true}     | ${true}
`(
  'FundingAddressTree refund (inputs blinded $blindInputs; output blinded $blindOutput)',
  ({ blindInputs, blindOutput }) => {
    let blindingKey: Buffer | undefined;

    beforeAll(async () => {
      if (blindOutput) {
        blindingKey = slip77(await initSecpZkp()).derive(
          Buffer.from(destinationOutput),
        ).publicKey!;
      }

      init(await initSecpZkp());
      await Promise.all([utilsInit(), elementsClient.init()]);
    });

    afterEach(async () => {
      await elementsClient.generate(1);
    });

    test('should refund via script path', async () => {
      const timeout = (await elementsClient.getBlockchainInfo()).blocks;
      const { utxo } = await createFundingAddressOutput(timeout, blindInputs);
      await refundSwap([utxo], timeout, blindingKey);
    });

    test('should not refund via script path when timelock is not reached', async () => {
      const timeout = (await elementsClient.getBlockchainInfo()).blocks;
      const { utxo } = await createFundingAddressOutput(
        timeout + 21,
        blindInputs,
      );

      await expect(refundSwap([utxo], timeout, blindingKey)).rejects.toEqual({
        code: -26,
        message:
          'non-mandatory-script-verify-flag (Locktime requirement not satisfied)',
      });
    });

    test('should not refund via script path when refund key is invalid', async () => {
      const timeout = (await elementsClient.getBlockchainInfo()).blocks;
      const { utxo } = await createFundingAddressOutput(timeout, blindInputs);
      utxo.privateKey = secp256k1.utils.randomPrivateKey();

      await expect(refundSwap([utxo], timeout, blindingKey)).rejects.toEqual({
        code: -26,
        message: 'non-mandatory-script-verify-flag (Invalid Schnorr signature)',
      });
    });
  },
);
