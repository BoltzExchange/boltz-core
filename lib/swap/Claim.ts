/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import * as bip65 from 'bip65';
import ops from '@boltz/bitcoin-ops';
import * as varuint from 'varuint-bitcoin';
import { Transaction, crypto, script } from 'bitcoinjs-lib';
import { OutputType } from '../consts/Enums';
import { ClaimDetails } from '../consts/Types';
import { estimateFee, Input } from '../FeeCalculator';
import { encodeSignature, scriptBuffersToScript, getOutputScriptType } from './SwapUtils';

/**
 * Claim swaps
 *
 * @param utxos UTXOs that should be claimed or refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param feePerByte how many satoshis per vbyte should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 * @param timeoutBlockHeight locktime of the transaction; only needed if the transaction is a refund
 */
export const constructClaimTransaction = (
  utxos: ClaimDetails[],
  destinationScript: Buffer,
  feePerByte: number,
  isRbf = true,
  timeoutBlockHeight?: number,
): Transaction => {
  const tx = new Transaction();

  // Refund transactions are just like claim ones and therefore this method
  // is also used for refunds. The locktime of refund transactions has to be
  // after the timelock of the UTXO is expired
  if (timeoutBlockHeight) {
    tx.locktime = bip65.encode({ blocks: timeoutBlockHeight });
  }

  // The sum of the values of all UTXOs that should be claimed or refunded
  let utxoValueSum = 0;
  const feeInputs: Input[] = [];

  utxos.forEach((utxo) => {
    utxoValueSum += utxo.value;
    feeInputs.push({ type: utxo.type, swapDetails: utxo });

    // Add the swap as input to the transaction
    //
    // RBF reference: https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki#summary
    tx.addInput(utxo.txHash, utxo.vout, isRbf ? 0xfffffffd : 0xffffffff);
  });

  // Estimate the fee for the transaction
  const fee = estimateFee(feePerByte, feeInputs, [getOutputScriptType(destinationScript)!]);

  // Send the sum of the UTXOs minus the estimated fee to the destination address
  tx.addOutput(destinationScript, utxoValueSum - fee);

  utxos.forEach((utxo, index) => {
    switch (utxo.type) {
      // Construct and sign the input scripts for P2SH inputs
      case OutputType.Legacy: {
        const sigHash = tx.hashForSignature(index, utxo.redeemScript, Transaction.SIGHASH_ALL);
        const signature = utxo.keys.sign(sigHash);

        const inputScript = [
          encodeSignature(Transaction.SIGHASH_ALL, signature),
          utxo.preimage,
          ops.OP_PUSHDATA1,
          utxo.redeemScript,
        ];

        tx.setInputScript(index, scriptBuffersToScript(inputScript));
        break;
      }

      // Construct the nested redeem script for nested SegWit inputs
      case OutputType.Compatibility: {
        const nestedScript = [
          varuint.encode(ops.OP_0).toString('hex'),
          crypto.sha256(utxo.redeemScript),
        ];

        const nested = scriptBuffersToScript(nestedScript);

        tx.setInputScript(index, scriptBuffersToScript([ nested ]));
        break;
      }
    }

    // Construct and sign the witness for (nested) SegWit inputs
    if (utxo.type !== OutputType.Legacy) {
      const sigHash = tx.hashForWitnessV0(index, utxo.redeemScript, utxo.value, Transaction.SIGHASH_ALL);
      const signature = script.signature.encode(utxo.keys.sign(sigHash), Transaction.SIGHASH_ALL);

      tx.setWitness(index, [
        signature,
        utxo.preimage,
        utxo.redeemScript,
      ]);
    }
  });

  return tx;
};
