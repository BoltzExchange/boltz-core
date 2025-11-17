/**
 * This file is based on the repository github.com/submarineswaps/swaps-service created by Alex Bosworth
 */
import type { Transaction } from 'bitcoinjs-lib';
import { getHexBuffer } from '../Utils';
import type { ClaimDetails, RefundDetails } from '../consts/Types';
import { constructClaimTransaction } from './Claim';

const dummyPreimage = getHexBuffer('0x00');

/**
 * Refund swaps
 *
 * @param utxos UTXOs that should be refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param timeoutBlockHeight locktime of the transaction
 * @param fee how many satoshis should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 */
export const constructRefundTransaction = (
  utxos: RefundDetails[],
  destinationScript: Buffer,
  timeoutBlockHeight: number,
  fee: number,
  isRbf = true,
): Transaction => {
  const claimUtxos: ClaimDetails[] = [];

  utxos.forEach((utxo) => {
    claimUtxos.push({
      ...utxo,
      preimage: dummyPreimage,
    });
  });

  return constructClaimTransaction(
    claimUtxos,
    destinationScript,
    fee,
    isRbf,
    timeoutBlockHeight,
    true,
  );
};
