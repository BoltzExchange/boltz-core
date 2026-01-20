import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import zkp from '@vulpemventures/secp256k1-zkp';
import { Transaction, address, networks } from 'liquidjs-lib';
import { randomBytes } from 'node:crypto';
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
import * as Musig from '../../../../lib/musig/Musig';
import { p2trOutput, p2wshOutput } from '../../../../lib/swap/Scripts';
import { detectSwap } from '../../../../lib/swap/SwapDetector';
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

      const preimageHash = sha256(preimage);
      const ourKeys = secp256k1.utils.randomPrivateKey();
      const theirKeys = secp256k1.utils.randomPrivateKey();

      const expectedOutput = address.toOutputScript(
        outputAddress || (await elementsClient.getNewAddress()),
        networks.regtest,
      );
      const expectedAmount = 10_000;

      const tree = liquidReverseSwapTree(
        preimageHash,
        secp256k1.getPublicKey(ourKeys),
        secp256k1.getPublicKey(theirKeys),
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
      const musig = Musig.create(
        ourKeys,
        [ourKeys, theirKeys].map((k) => secp256k1.getPublicKey(k)),
      );
      const tweakedMusig = tweakMusig(musig, tree.tree);

      let swapAddress = address.fromOutputScript(
        Buffer.from(p2trOutput(tweakedMusig.aggPubkey)),
        networks.regtest,
      );
      let blindingPrivateKey: Buffer | undefined;

      if (shouldBlind) {
        const enc = blindWitnessAddress(swapAddress, OutputType.Taproot);
        swapAddress = enc.address;
        blindingPrivateKey = enc.blindingKey.privateKey;
      }

      const feeBuffer = 210n;
      const tx = Transaction.fromHex(
        await elementsClient.getRawTransaction(
          await elementsClient.sendToAddress(
            swapAddress,
            expectedAmount + Number(feeBuffer),
          ),
        ),
      );

      const output = detectSwap(Buffer.from(tweakedMusig.aggPubkey), tx)!;

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
            type: OutputType.Taproot,
            preimage,
            swapTree: tree,
            blindingPrivateKey,
            transactionId: tx.getId(),
            privateKey: ourKeys,
            internalKey: tweakedMusig.internalKey,
          } as LiquidClaimDetails,
        ],
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

      // Apply the same tweak to create a new MusigKeyAgg, then set message
      const tweakedMusig = musig.tweak
        ? Musig.create(utxos[0].privateKey!, musig.publicKeys).xonlyTweakAdd(
            musig.tweak,
          )
        : Musig.create(utxos[0].privateKey!, musig.publicKeys);

      const ourWithNonce = tweakedMusig.message(sigHash).generateNonce();
      const theirWithNonce = (
        musig.tweak
          ? Musig.create(theirKeys, [
              musig.publicKeys[0],
              secp256k1.getPublicKey(theirKeys),
            ]).xonlyTweakAdd(musig.tweak)
          : Musig.create(theirKeys, [
              musig.publicKeys[0],
              secp256k1.getPublicKey(theirKeys),
            ])
      )
        .message(sigHash)
        .generateNonce();

      const ourAggregated = ourWithNonce.aggregateNonces([
        [secp256k1.getPublicKey(theirKeys), theirWithNonce.publicNonce],
      ]);
      const theirAggregated = theirWithNonce.aggregateNonces([
        [musig.publicKeys[0], ourWithNonce.publicNonce],
      ]);

      let ourSigned = ourAggregated.initializeSession().signPartial();
      const theirSigned = theirAggregated.initializeSession().signPartial();

      ourSigned = ourSigned.addPartial(
        secp256k1.getPublicKey(theirKeys),
        theirSigned.ourPartialSignature,
      );

      claimTx.setWitness(0, [Buffer.from(ourSigned.aggregatePartials())]);

      await elementsClient.sendRawTransaction(claimTx.toHex());
    });

    test('should claim via signature script path', async () => {
      const { utxos, feeBuffer, expectedOutput, ourKeys } =
        await createOutput();
      utxos[0].privateKey = ourKeys;
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
            redeemScript: undefined,
            legacyTx: undefined,
            type: OutputType.Taproot,
            cooperative: false,
            privateKey: theirKeys,
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
              Buffer.from(
                p2trOutput(
                  secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey()),
                ),
              ),
              networks.regtest,
            );
            break;

          case 'p2wsh':
            outputAddress = address.fromOutputScript(
              Buffer.from(p2wshOutput(randomBytes(32))),
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
              type: OutputType.Taproot,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              transactionId: lockupTx.getId(),
              internalKey: musig.internalKey,
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
              type: OutputType.Taproot,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              transactionId: lockupTx.getId(),
              internalKey: musig.internalKey,
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
            type: OutputType.Taproot,
            blindingPrivateKey,
            swapTree: tree,
            cooperative: false,
            transactionId: lockupTx.getId(),
            preimage: randomBytes(32),
            internalKey: musig.internalKey,
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
            type: OutputType.Taproot,
            preimage,
            blindingPrivateKey,
            swapTree: tree,
            cooperative: false,
            transactionId: lockupTx.getId(),
            internalKey: musig.internalKey,
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
              type: OutputType.Taproot,
              preimage,
              blindingPrivateKey,
              swapTree: tree,
              cooperative: false,
              transactionId: lockupTx.getId(),
              internalKey: musig.internalKey,
            },
          ],
          expectedOutput,
          feeBuffer - BigInt(delta),
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
