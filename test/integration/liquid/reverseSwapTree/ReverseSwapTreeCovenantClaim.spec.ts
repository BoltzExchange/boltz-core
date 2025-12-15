import zkp from '@vulpemventures/secp256k1-zkp';
import { crypto } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import { Transaction, address, networks } from 'liquidjs-lib';
import { OutputType } from '../../../../lib/consts/Enums';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import {
  constructClaimTransaction,
  constructRefundTransaction,
  init,
} from '../../../../lib/liquid';
import liquidReverseSwapTree, {
  Feature,
} from '../../../../lib/liquid/swap/ReverseSwapTree';
import {
  hashForWitnessV1,
  tweakMusig,
} from '../../../../lib/liquid/swap/TaprootUtils';
import Musig from '../../../../lib/musig/Musig';
import { p2trOutput, p2wshOutput } from '../../../../lib/swap/Scripts';
import { detectSwap } from '../../../../lib/swap/SwapDetector';
import { ECPair } from '../../../unit/Utils';
import {
  blindWitnessAddress,
  elementsClient,
  init as utilsInit,
} from '../../Utils';
import { AddressType } from '../../utils/ChainClient';

describe.each`
  shouldBlind
  ${false}
  ${true}
`(
  'ReverseSwapTree Covenant claim path with blinded input $shouldBlind',
  ({ shouldBlind }) => {
    beforeAll(async () => {
      init(await zkp());
      await Promise.all([utilsInit(), elementsClient.init()]);
    });

    afterEach(async () => {
      await elementsClient.generate(1);
    });

    const createOutput = async (
      preimage?: Buffer,
      outputAddress?: string,
      timeoutBlockHeight?: number,
    ) => {
      preimage = preimage || randomBytes(32);
      timeoutBlockHeight =
        timeoutBlockHeight ||
        (await elementsClient.getBlockchainInfo()).blocks + 21;

      const preimageHash = crypto.sha256(preimage);
      const ourKeys = ECPair.makeRandom();
      const theirKeys = ECPair.makeRandom();

      const expectedOutput = address.toOutputScript(
        outputAddress || (await elementsClient.getNewAddress()),
        networks.regtest,
      );
      const expectedAmount = 10_000;

      const tree = liquidReverseSwapTree(
        preimageHash,
        Buffer.from(ourKeys.publicKey),
        Buffer.from(theirKeys.publicKey),
        timeoutBlockHeight,
        [
          {
            expectedAmount,
            outputScript: expectedOutput,
            type: Feature.ClaimCovenant,
            assetHash: networks.regtest.assetHash,
          },
        ],
      );
      const tweakedMusig = tweakMusig(
        new Musig(
          ourKeys,
          [ourKeys.publicKey, theirKeys.publicKey].map(Buffer.from),
          randomBytes(32),
        ),
        tree.tree,
      );

      let swapAddress = address.fromOutputScript(
        p2trOutput(Buffer.from(tweakedMusig.pubkeyAgg)),
        networks.regtest,
      );
      let blindingPrivateKey: Buffer | undefined = undefined;

      if (shouldBlind) {
        const enc = blindWitnessAddress(swapAddress, OutputType.Taproot);
        swapAddress = enc.address;
        blindingPrivateKey = enc.blindingKey.privateKey;
      }

      const feeBuffer = 210;
      const tx = Transaction.fromHex(
        await elementsClient.getRawTransaction(
          await elementsClient.sendToAddress(
            swapAddress,
            expectedAmount + feeBuffer,
          ),
        ),
      );

      const output = detectSwap(Buffer.from(tweakedMusig.pubkeyAgg), tx)!;

      return {
        tree,
        musig: tweakedMusig,
        output,
        ourKeys,
        preimage,
        feeBuffer,
        theirKeys,
        expectedAmount,
        expectedOutput,
        timeoutBlockHeight,
        blindingPrivateKey,
        lockupTx: tx,
        utxos: [
          {
            ...output,
            preimage,
            swapTree: tree,
            blindingPrivateKey,
            txHash: tx.getHash(),
            internalKey: Buffer.from(tweakedMusig.internalKey),
          },
        ] as LiquidClaimDetails[],
      };
    };

    test('should claim via key path', async () => {
      const { utxos, musig, feeBuffer, theirKeys, expectedOutput } =
        await createOutput(undefined, undefined, undefined);
      utxos[0].cooperative = true;

      const claimTx = constructClaimTransaction(
        utxos,
        expectedOutput,
        feeBuffer,
        true,
        networks.regtest,
      );

      const sigHash = hashForWitnessV1(networks.regtest, utxos, claimTx, 0);

      const updatedMusig = Musig.updateMessage(musig, sigHash);
      const theirMusig = new Musig(
        theirKeys,
        [updatedMusig.publicKeys[0], theirKeys.publicKey].map(Buffer.from),
        sigHash,
        updatedMusig.tweak,
      );

      updatedMusig.aggregateNonces([
        [theirKeys.publicKey, theirMusig.getPublicNonce()],
      ]);
      theirMusig.aggregateNonces([
        [updatedMusig.publicKeys[0], updatedMusig.getPublicNonce()],
      ]);
      updatedMusig.signPartial();
      updatedMusig.addPartial(
        Buffer.from(theirKeys.publicKey),
        theirMusig.signPartial(),
      );

      claimTx.setWitness(0, [Buffer.from(updatedMusig.aggregatePartials())]);

      await elementsClient.sendRawTransaction(claimTx.toHex());
    });

    test('should claim via signature script path', async () => {
      const { utxos, feeBuffer, expectedOutput, ourKeys } =
        await createOutput();
      utxos[0].keys = ourKeys;
      utxos[0].cooperative = false;

      const claimTx = constructClaimTransaction(
        utxos,
        expectedOutput,
        feeBuffer,
        true,
        networks.regtest,
      );

      await elementsClient.sendRawTransaction(claimTx.toHex());
    });

    test('should refund via signature script path', async () => {
      const {
        utxos,
        timeoutBlockHeight,
        feeBuffer,
        expectedOutput,
        theirKeys,
      } = await createOutput(
        undefined,
        undefined,
        (await elementsClient.getBlockchainInfo()).blocks - 1,
      );

      const claimTx = constructRefundTransaction(
        [
          {
            ...utxos[0],
            keys: theirKeys,
            cooperative: false,
          },
        ],
        expectedOutput,
        timeoutBlockHeight,
        feeBuffer,
        true,
        networks.regtest,
      );

      await elementsClient.sendRawTransaction(claimTx.toHex());
    });

    test.each`
      addressType
      ${'p2tr'}
      ${AddressType.Bech32}
      ${'p2wsh'}
      ${AddressType.P2shegwit}
      ${AddressType.Legacy}
    `(
      'should claim via covenant script path to $addressType address',
      async ({ addressType }) => {
        let outputAddress: string;

        switch (addressType) {
          case 'p2tr':
            outputAddress = address.fromOutputScript(
              p2trOutput(Buffer.from(ECPair.makeRandom().publicKey)),
              networks.regtest,
            );
            break;

          case 'p2wsh':
            outputAddress = address.fromOutputScript(
              p2wshOutput(randomBytes(32)),
              networks.regtest,
            );
            break;

          default:
            outputAddress = await elementsClient.getNewAddress(addressType);
            break;
        }

        const {
          tree,
          musig,
          output,
          preimage,
          lockupTx,
          feeBuffer,
          expectedOutput,
          blindingPrivateKey,
        } = await createOutput(undefined, outputAddress, undefined);

        const claimTx = constructClaimTransaction(
          [
            {
              ...output,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              txHash: lockupTx.getHash(),
              internalKey: Buffer.from(musig.internalKey),
            },
          ],
          expectedOutput,
          feeBuffer,
          true,
          networks.regtest,
        );
        await elementsClient.sendRawTransaction(claimTx.toHex());
      },
    );

    test.each`
      length
      ${31}
      ${33}
    `(
      'should not claim with invalid preimage hash length $length',
      async ({ length }) => {
        const {
          tree,
          musig,
          output,
          preimage,
          lockupTx,
          feeBuffer,
          expectedOutput,
          blindingPrivateKey,
        } = await createOutput(randomBytes(length));

        const claimTx = constructClaimTransaction(
          [
            {
              ...output,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              txHash: lockupTx.getHash(),
              internalKey: Buffer.from(musig.internalKey),
            },
          ],
          expectedOutput,
          feeBuffer,
          true,
          networks.regtest,
        );
        await expect(
          elementsClient.sendRawTransaction(claimTx.toHex()),
        ).rejects.toEqual({
          code: -26,
          message:
            'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
        });
      },
    );

    test('should not claim with invalid preimage', async () => {
      const {
        tree,
        musig,
        output,
        lockupTx,
        feeBuffer,
        expectedOutput,
        blindingPrivateKey,
      } = await createOutput();

      const claimTx = constructClaimTransaction(
        [
          {
            ...output,
            blindingPrivateKey,
            swapTree: tree,
            cooperative: false,
            txHash: lockupTx.getHash(),
            preimage: randomBytes(32),
            internalKey: Buffer.from(musig.internalKey),
          },
        ],
        expectedOutput,
        feeBuffer,
        true,
        networks.regtest,
      );
      await expect(
        elementsClient.sendRawTransaction(claimTx.toHex()),
      ).rejects.toEqual({
        code: -26,
        message:
          'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
      });
    });

    test('should not claim to invalid address', async () => {
      const {
        tree,
        musig,
        output,
        preimage,
        lockupTx,
        feeBuffer,
        blindingPrivateKey,
      } = await createOutput();

      const claimTx = constructClaimTransaction(
        [
          {
            ...output,
            preimage,
            blindingPrivateKey,
            swapTree: tree,
            cooperative: false,
            txHash: lockupTx.getHash(),
            internalKey: Buffer.from(musig.internalKey),
          },
        ],
        address.toOutputScript(
          await elementsClient.getNewAddress(),
          networks.regtest,
        ),
        feeBuffer,
        true,
        networks.regtest,
      );
      await expect(
        elementsClient.sendRawTransaction(claimTx.toHex()),
      ).rejects.toEqual({
        code: -26,
        message:
          'non-mandatory-script-verify-flag (Script failed an OP_EQUALVERIFY operation)',
      });
    });

    test.each`
      delta
      ${2}
      ${1}
      ${-1}
      ${-2}
    `(
      'should not claim with $delta delta to expected amount',
      async ({ delta }) => {
        const {
          tree,
          musig,
          output,
          preimage,
          lockupTx,
          feeBuffer,
          expectedOutput,
          blindingPrivateKey,
        } = await createOutput();

        const claimTx = constructClaimTransaction(
          [
            {
              ...output,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              txHash: lockupTx.getHash(),
              internalKey: Buffer.from(musig.internalKey),
            },
          ],
          expectedOutput,
          feeBuffer - delta,
          true,
          networks.regtest,
        );
        await expect(
          elementsClient.sendRawTransaction(claimTx.toHex()),
        ).rejects.toEqual({
          code: -26,
          message:
            'non-mandatory-script-verify-flag (Script evaluated without error but finished with a false/empty top stack element)',
        });
      },
    );
  },
);
