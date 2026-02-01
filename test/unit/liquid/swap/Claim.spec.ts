import { secp256k1 } from '@noble/curves/secp256k1';
import zkp from '@vulpemventures/secp256k1-zkp';
import { confidential } from 'liquidjs-lib';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../../lib/consts/Enums';
import { Errors } from '../../../../lib/consts/Errors';
import type { LiquidClaimDetails } from '../../../../lib/liquid';
import { constructClaimTransaction, init } from '../../../../lib/liquid';
import { p2trOutput } from '../../../../lib/swap/Scripts';
import { fundingAddressTree } from '../../../../lib/swap/SwapTree';
import { toXOnly } from '../../../../lib/swap/TaprootUtils';
import { lbtcRegtest, liquidClaimDetailsMap, nonce } from './ClaimDetails';

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

  test('should not claim FundingAddressTree (no claim leaf)', () => {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey);
    const tree = fundingAddressTree(true, publicKey, 800000);

    expect(() =>
      constructClaimTransaction(
        [
          {
            type: OutputType.Taproot,
            swapTree: tree,
            internalKey: Buffer.from(toXOnly(publicKey)),
            privateKey,
            preimage: randomBytes(32),
            transactionId: randomBytes(32).toString('hex'),
            vout: 0,
            script: Buffer.from(p2trOutput(toXOnly(publicKey))),
            nonce,
            asset: lbtcRegtest,
            value: confidential.satoshiToConfidentialValue(10000),
          },
        ],
        Buffer.from(p2trOutput(toXOnly(publicKey))),
        1000n,
      ),
    ).toThrow(Errors.claimRequiresClaimLeaf);
  });
});
