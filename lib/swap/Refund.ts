/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */

import { getHexBuffer } from '../Utils';
import { constructClaimTransaction } from './Claim';
import { RefundDetails, ClaimDetails } from '../consts/Types';

const dummyPreimage = getHexBuffer('0x00');

/**
 * Refund swaps
 *
 * @param utxos UTXOs that should be refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param timeoutBlockHeight locktime of the transaction
 * @param feePerByte how many satoshis per vbyte should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 */
export const constructRefundTransaction = (
  utxos: RefundDetails[],
  destinationScript: Buffer,
  timeoutBlockHeight: number,
  feePerByte: number,
  isRbf = true,
) => {
  const claimUtxos: ClaimDetails[] = [];

  utxos.forEach((utxo) => {
    claimUtxos.push({
      preimage: dummyPreimage,
      ...utxo,
    });
  });

  return constructClaimTransaction(
    claimUtxos,
    destinationScript,
    feePerByte,
    isRbf,
    timeoutBlockHeight,
  );
};
