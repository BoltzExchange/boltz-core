import { Transaction } from 'liquidjs-lib';
import { getHexBuffer } from '../../Utils';
import { constructClaimTransaction } from './Claim';
import { LiquidClaimDetails, LiquidRefundDetails } from '../consts/Types';

const dummyPreimage = getHexBuffer('0x00');

/**
 * Refund swaps
 *
 * @param utxos UTXOs that should be refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param timeoutBlockHeight locktime of the transaction; only needed if the transaction is a refund
 * @param fee how many satoshis should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 * @param assetHash asset hash of Liquid asset
 * @param blindingKey blinding public key for the output; undefined if the output should not be blinded
 */
export const constructRefundTransaction = (
  utxos: LiquidRefundDetails[],
  destinationScript: Buffer,
  timeoutBlockHeight: number,
  fee: number,
  isRbf = true,
  assetHash?: string,
  blindingKey?: Buffer,
): Transaction => {
  const claimUtxos: LiquidClaimDetails[] = utxos.map((utxo) => ({
    preimage: dummyPreimage,
    ...utxo,
  }));

  return constructClaimTransaction(
    claimUtxos,
    destinationScript,
    fee,
    isRbf,
    assetHash,
    blindingKey,
    timeoutBlockHeight,
  );
};
