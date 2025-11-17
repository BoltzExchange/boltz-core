import zkp from '@vulpemventures/secp256k1-zkp';
import { getHexBuffer } from '../../../../lib/Utils';
import { OutputType } from '../../../../lib/consts/Enums';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import { constructClaimTransaction, init } from '../../../../lib/liquid';
import { liquidClaimDetailsMap } from './ClaimDetails';

describe('Liquid Claim', () => {
  const testClaim = (utxos: LiquidClaimDetails[], fee: number) => {
    return constructClaimTransaction(
      utxos,
      getHexBuffer('00140000000000000000000000000000000000000000'),
      fee,
      false,
    );
  };

  beforeAll(async () => {
    init(await zkp());
  });

  test('should claim a P2WSH swap', () => {
    expect(
      testClaim([liquidClaimDetailsMap.get(OutputType.Bech32)!], 22).toHex(),
    ).toMatchSnapshot();
  });

  test('should claim multiple P2WSH swaps in one transaction', () => {
    const details = liquidClaimDetailsMap.get(OutputType.Bech32)!;

    expect(
      testClaim(
        [
          details,
          {
            ...details,
            vout: details.vout + 1,
          },
          {
            ...details,
            vout: details.vout + 2,
          },
        ],
        40,
      ).toHex(),
    ).toMatchSnapshot();
  });

  test.each`
    type                        | name
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `('should throw with $name inputs', ({ type }) => {
    expect(() =>
      testClaim(
        [
          {
            type,
            redeemScript: Buffer.alloc(0),
          } as LiquidClaimDetails,
        ],
        1,
      ),
    ).toThrow('only Taproot or native SegWit inputs supported');
  });

  test('should throw with inconsistently blinded inputs', () => {
    expect(() =>
      testClaim(
        [
          {
            type: OutputType.Bech32,
            redeemScript: Buffer.alloc(0),
            blindingPrivateKey: Buffer.alloc(1),
          },
          {
            type: OutputType.Bech32,
            redeemScript: Buffer.alloc(0),
          },
        ] as LiquidClaimDetails[],
        1,
      ),
    ).toThrow('all or none inputs have to be blinded');
  });
});
