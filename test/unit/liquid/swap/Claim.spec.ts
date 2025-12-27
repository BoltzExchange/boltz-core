import zkp from '@vulpemventures/secp256k1-zkp';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils';
import { OutputType } from '../../../../lib/consts/Enums';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import { constructClaimTransaction, init } from '../../../../lib/liquid';
import { liquidClaimDetailsMap } from './ClaimDetails';

describe('Liquid Claim', () => {
  const testClaim = (utxos: LiquidClaimDetails[], fee: bigint) => {
    return constructClaimTransaction(
      utxos.map((utxo) => ({
        ...utxo,
        transactionId: reverseBuffer(
          Buffer.from(utxo.transactionId, 'hex'),
        ).toString('hex'),
      })),
      Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
      fee,
      false,
    );
  };

  beforeAll(async () => {
    init(await zkp());
  });

  test('should claim a P2WSH swap', () => {
    expect(
      testClaim([liquidClaimDetailsMap.get(OutputType.Bech32)!], 22n).toHex(),
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
        40n,
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
            transactionId:
              '0000000000000000000000000000000000000000000000000000000000000000',
            redeemScript: Buffer.alloc(0),
          } as unknown as LiquidClaimDetails,
        ],
        1n,
      ),
    ).toThrow('only Taproot or native SegWit inputs supported');
  });

  test('should throw with inconsistently blinded inputs', () => {
    expect(() =>
      testClaim(
        [
          {
            type: OutputType.Bech32,
            transactionId:
              '0000000000000000000000000000000000000000000000000000000000000000',
            redeemScript: Buffer.alloc(0),
            blindingPrivateKey: Buffer.alloc(1),
          },
          {
            type: OutputType.Bech32,
            transactionId:
              '0000000000000000000000000000000000000000000000000000000000000000',
            redeemScript: Buffer.alloc(0),
          },
        ] as unknown as LiquidClaimDetails[],
        1n,
      ),
    ).toThrow('all or none inputs have to be blinded');
  });
});
