import { secp256k1 } from '@noble/curves/secp256k1.js';
import { confidential } from 'liquidjs-lib';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils.js';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../../lib/consts/Enums.ts';
import { Errors } from '../../../../lib/consts/Errors.ts';
import type { LiquidClaimDetails } from '../../../../lib/liquid/index.ts';
import {
  constructClaimTransaction,
  init,
} from '../../../../lib/liquid/index.ts';
import { p2trOutput } from '../../../../lib/swap/Scripts.ts';
import { fundingAddressTree } from '../../../../lib/swap/SwapTree.ts';
import { toXOnly } from '../../../../lib/swap/TaprootUtils.ts';
import zkp from '../../../zkp.ts';
import { lbtcRegtest, liquidClaimDetailsMap, nonce } from './ClaimDetails.ts';

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

  test('should sort inputs by BIP69 regardless of caller-provided order', () => {
    const base = liquidClaimDetailsMap.get(OutputType.Bech32)!;
    const txids = [
      '28e0fdd185542f2c6ea19030b0796051e7772b6026dd5ddccd7a2f93b73e6fc2',
      '26aa6e6d8b9e49bb0630aac301db6757c02e3619feb4ee0eea81eb1672947024',
      '0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57',
    ];
    const shuffled = txids.map((transactionId) => ({ ...base, transactionId }));
    const preSorted = [...shuffled].reverse();

    expect(testClaim(shuffled, 40n).toHex()).toEqual(
      testClaim(preSorted, 40n).toHex(),
    );
    expect(testClaim(shuffled, 40n).toHex()).toMatchSnapshot();
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
    const privateKey = secp256k1.utils.randomSecretKey();
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
