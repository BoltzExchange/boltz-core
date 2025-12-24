import zkp from '@vulpemventures/secp256k1-zkp';
import { confidential } from 'liquidjs-lib';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils';
import { OutputType } from '../../../../lib/consts/Enums';
import type { LiquidRefundDetails } from '../../../../lib/liquid';
import { constructRefundTransaction, init } from '../../../../lib/liquid';
import { lbtcRegtest, nonce } from './ClaimDetails';

describe('Liquid Refund', () => {
  const utxo = {
    nonce,
    vout: 0,
    asset: lbtcRegtest,
    type: OutputType.Bech32,
    privateKey: Buffer.from(
      '96960cf685a4c1f174ff0918ba937cd2d5090c0d7e20646b091b173e55dadb52',
      'hex',
    ),
    value: confidential.satoshiToConfidentialValue(2000),
    script: Buffer.from(
      '00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e',
      'hex',
    ),
    transactionId:
      '285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754',
    redeemScript: Buffer.from(
      'a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac',
      'hex',
    ),
  };

  const testRefund = (utxos: LiquidRefundDetails[], fee: number) => {
    return constructRefundTransaction(
      utxos.map((utxo) => ({
        ...utxo,
        transactionId: reverseBuffer(
          Buffer.from(utxo.transactionId, 'hex'),
        ).toString('hex'),
      })),
      Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
      11,
      BigInt(fee),
    );
  };

  beforeAll(async () => {
    init(await zkp());
  });

  test('should refund a P2WSH swap', async () => {
    expect(testRefund([utxo], 21).toHex()).toMatchSnapshot();
  });

  test('should refund multiple swaps in one transaction', () => {
    expect(
      testRefund(
        [
          utxo,
          {
            ...utxo,
            vout: utxo.vout + 1,
          },
          {
            ...utxo,
            vout: utxo.vout + 2,
          },
        ],
        38,
      ).virtualSize(),
    ).toMatchSnapshot();
  });
});
