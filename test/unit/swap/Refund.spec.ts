import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import type { RefundDetails } from '../../../lib/consts/Types';
import { constructRefundTransaction } from '../../../lib/swap/Refund';

const bip32 = BIP32Factory(ecc);

describe('Refund', () => {
  const utxo = {
    txHash: getHexBuffer(
      '285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754',
    ),
    vout: 0,
    value: 2000,

    keys: bip32.fromBase58(
      'xprv9xgxR6htMdXUXGipynZp1janNrWNYJxaz2o4tH9fdtZqcF26BX5VB88GSM5KgZHWCyAyb8FZpQik2UET84CHfGWXFMG5zWWjmtDMgqYuo19',
    ),
    redeemScript: getHexBuffer(
      'a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac',
    ),
  };

  const refundDetails = [
    {
      ...utxo,
      type: OutputType.Bech32,
      script: getHexBuffer(
        '00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e',
      ),
    },
    {
      ...utxo,
      type: OutputType.Legacy,
      script: getHexBuffer('a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87'),
    },
    {
      ...utxo,
      type: OutputType.Compatibility,
      script: getHexBuffer('a9148f439aff651860bdb28c66500c6e958cfbe7a69387'),
    },
  ];

  const refundDetailsMap = new Map<OutputType, RefundDetails>(
    refundDetails.map((entry) => [entry.type, entry]),
  );

  const testRefund = (utxos: RefundDetails[], fee: number) => {
    return constructRefundTransaction(
      utxos,
      getHexBuffer('00140000000000000000000000000000000000000000'),
      11,
      fee,
    );
  };

  test.each`
    type                        | fee    | name
    ${OutputType.Bech32}        | ${127} | ${'P2WSH'}
    ${OutputType.Compatibility} | ${162} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${258} | ${'P2SH'}
  `('should refund a $name swap', async ({ type, fee }) => {
    expect(
      testRefund([refundDetailsMap.get(type)!], fee).toHex(),
    ).toMatchSnapshot();
  });

  test('should refund multiple swaps in one transaction', () => {
    expect(testRefund(refundDetails, 466).toHex()).toMatchSnapshot();
  });
});
