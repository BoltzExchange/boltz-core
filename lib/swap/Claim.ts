/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */
import ops from '@boltz/bitcoin-ops';
import * as bip65 from 'bip65';
import { Transaction, crypto, script } from 'bitcoinjs-lib';
import { tapleafHash, toHashTree } from 'bitcoinjs-lib/src/payments/bip341';
import * as varuint from 'varuint-bitcoin';
import { getHexString } from '../Utils';
import { OutputType } from '../consts/Enums';
import type { ClaimDetails } from '../consts/Types';
import { encodeSignature, scriptBuffersToScript } from './SwapUtils';
import { createControlBlock, hashForWitnessV1 } from './TaprootUtils';

const dummyTaprootSignature = Buffer.alloc(64);

export const isRelevantTaprootOutput = (
  utxo: Omit<ClaimDetails, 'value' | 'keys'>,
) => utxo.type === OutputType.Taproot && utxo.cooperative !== true;

export const validateInputs = (
  utxos: Omit<ClaimDetails, 'value' | 'keys'>[],
) => {
  if (
    utxos
      .filter((utxo) => utxo.type !== OutputType.Taproot)
      .some((utxo) => utxo.redeemScript === undefined)
  ) {
    throw 'not all non Taproot inputs have a redeem script';
  }

  const relevantTaprootOutputs = utxos.filter(isRelevantTaprootOutput);

  if (relevantTaprootOutputs.some((utxo) => utxo.swapTree === undefined)) {
    throw 'not all Taproot inputs have a swap tree';
  }

  if (relevantTaprootOutputs.some((utxo) => utxo.internalKey === undefined)) {
    throw 'not all Taproot inputs have an internal key';
  }
};

/**
 * Claim swaps
 *
 * @param utxos UTXOs that should be claimed or refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param fee how many satoshis should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 * @param timeoutBlockHeight locktime of the transaction; only needed if the transaction is a refund
 * @param isRefund whether the transaction is a refund or claim
 */
export const constructClaimTransaction = (
  utxos: ClaimDetails[],
  destinationScript: Buffer,
  fee: number,
  isRbf = true,
  timeoutBlockHeight?: number,
  isRefund = false,
): Transaction => {
  validateInputs(utxos);

  const tx = new Transaction();

  // Refund transactions are just like claim ones and therefore this method
  // is also used for refunds. The locktime of refund transactions has to be
  // after the timelock of the UTXO is expired
  if (timeoutBlockHeight) {
    tx.locktime = bip65.encode({ blocks: timeoutBlockHeight });
  }

  // The sum of the values of all UTXOs that should be claimed or refunded
  let utxoValueSum = BigInt(0);

  utxos.forEach((utxo) => {
    utxoValueSum += BigInt(utxo.value);

    // Add the swap as input to the transaction
    // RBF reference: https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki#summary
    tx.addInput(utxo.txHash, utxo.vout, isRbf ? 0xfffffffd : 0xffffffff);
  });

  // Send the sum of the UTXOs minus the estimated fee to the destination address
  tx.addOutput(destinationScript, Number(utxoValueSum - BigInt(fee)));

  utxos.forEach((utxo, index) => {
    switch (utxo.type) {
      // Construct and sign the input scripts for P2SH inputs
      case OutputType.Legacy: {
        const sigHash = tx.hashForSignature(
          index,
          utxo.redeemScript!,
          Transaction.SIGHASH_ALL,
        );
        const signature = utxo.keys.sign(sigHash);

        const inputScript = [
          encodeSignature(Transaction.SIGHASH_ALL, Buffer.from(signature)),
          utxo.preimage,
          ops.OP_PUSHDATA1,
          utxo.redeemScript!,
        ];

        tx.setInputScript(index, scriptBuffersToScript(inputScript));
        break;
      }

      // Construct the nested redeem script for nested SegWit inputs
      case OutputType.Compatibility: {
        const nestedScript = [
          getHexString(Buffer.from(varuint.encode(ops.OP_0).buffer)),
          crypto.sha256(utxo.redeemScript!),
        ];

        const nested = scriptBuffersToScript(nestedScript);

        tx.setInputScript(index, scriptBuffersToScript([nested]));
        break;
      }
    }

    // Construct and sign the witness for (nested) SegWit inputs
    // When the Taproot output is spent cooperatively, we leave it empty
    if (utxo.type === OutputType.Taproot) {
      if (utxo.cooperative !== true) {
        const tapLeaf = isRefund
          ? utxo.swapTree!.refundLeaf
          : utxo.swapTree!.claimLeaf;
        const sigHash = hashForWitnessV1(
          utxos,
          tx,
          index,
          tapleafHash(tapLeaf),
          Transaction.SIGHASH_DEFAULT,
        );

        const signature = Buffer.from(utxo.keys.signSchnorr(sigHash));
        const witness = isRefund ? [signature] : [signature, utxo.preimage];

        tx.setWitness(
          index,
          witness.concat([
            tapLeaf.output,
            createControlBlock(
              toHashTree(utxo.swapTree!.tree),
              tapLeaf,
              utxo.internalKey!,
            ),
          ]),
        );
      } else {
        // Stub the signature to allow for accurate fee estimations
        tx.setWitness(index, [dummyTaprootSignature]);
      }
    } else if (
      utxo.type === OutputType.Bech32 ||
      utxo.type === OutputType.Compatibility
    ) {
      const sigHash = tx.hashForWitnessV0(
        index,
        utxo.redeemScript!,
        utxo.value,
        Transaction.SIGHASH_ALL,
      );
      const signature = script.signature.encode(
        Buffer.from(utxo.keys.sign(sigHash)),
        Transaction.SIGHASH_ALL,
      );

      tx.setWitness(index, [signature, utxo.preimage, utxo.redeemScript!]);
    }
  });

  return tx;
};
