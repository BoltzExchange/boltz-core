import { secp256k1 } from '@noble/curves/secp256k1.js';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils.js';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../lib/consts/Enums.ts';
import { Errors } from '../../../lib/consts/Errors.ts';
import type { ClaimDetails } from '../../../lib/consts/Types.ts';
import { constructClaimTransaction } from '../../../lib/swap/Claim.ts';
import { p2trOutput } from '../../../lib/swap/Scripts.ts';
import { fundingAddressTree } from '../../../lib/swap/SwapTree.ts';
import { toXOnly } from '../../../lib/swap/TaprootUtils.ts';
import { claimDetails, claimDetailsMap } from './ClaimDetails.ts';

describe('Claim', () => {
  const testClaim = (utxos: ClaimDetails[], fee: number) => {
    return constructClaimTransaction(
      utxos.map((utxo) => ({
        ...utxo,
        transactionId: reverseBuffer(
          Buffer.from(utxo.transactionId, 'hex'),
        ).toString('hex'),
      })),
      Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
      BigInt(fee),
      false,
    );
  };

  test.each`
    type                        | fee    | name
    ${OutputType.Bech32}        | ${131} | ${'P2WSH'}
    ${OutputType.Compatibility} | ${166} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${274} | ${'P2SH'}
  `('should claim a $name swap', ({ type, fee }) => {
    expect(testClaim([claimDetailsMap.get(type)!], fee).hex).toMatchSnapshot();
  });

  test('should claim multiple swaps in one transaction', () => {
    expect(testClaim(claimDetails, 490).hex).toMatchSnapshot();
  });

  test('should sort inputs by BIP69 regardless of caller-provided order', () => {
    const base = claimDetailsMap.get(OutputType.Bech32)!;
    const txids = [
      '28e0fdd185542f2c6ea19030b0796051e7772b6026dd5ddccd7a2f93b73e6fc2',
      '26aa6e6d8b9e49bb0630aac301db6757c02e3619feb4ee0eea81eb1672947024',
      '0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57',
    ];
    const shuffled = txids.map((transactionId) => ({ ...base, transactionId }));
    const preSorted = [...shuffled].reverse();

    expect(testClaim(shuffled, 490).hex).toEqual(testClaim(preSorted, 490).hex);
    expect(testClaim(shuffled, 490).hex).toMatchSnapshot();
  });

  test.each`
    details
    ${[
  {
    type: OutputType.Legacy,
  },
]}
    ${[
  {
    type: OutputType.Compatibility,
  },
]}
    ${[
  {
    type: OutputType.Bech32,
  },
]}
    ${[
  {
    type: OutputType.Legacy,
    redeemScript: randomBytes(32),
  },
  {
    type: OutputType.Bech32,
  },
]}
  `(
    'should not claim when non Taproot inputs do not have a redeem script',
    ({ details }) => {
      expect(() =>
        constructClaimTransaction(
          details,
          p2trOutput(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey())),
          1n,
        ),
      ).toThrow('not all non Taproot inputs have a redeem script');
    },
  );

  test.each`
    details
    ${[{ type: OutputType.Taproot }]}
    ${[{ type: OutputType.Taproot, cooperative: false }]}
    ${[{ type: OutputType.Taproot, cooperative: undefined }]}
    ${[{ type: OutputType.Taproot, cooperative: null }]}
  `(
    'should not claim when uncooperative Taproot inputs do not have a swapTree',
    ({ details }) => {
      expect(() =>
        constructClaimTransaction(
          details,
          p2trOutput(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey())),
          1n,
        ),
      ).toThrow('not all Taproot inputs have a swap tree');
    },
  );

  test.each`
    details
    ${[{ type: OutputType.Taproot, swapTree: '' }]}
    ${[{ type: OutputType.Taproot, swapTree: '', cooperative: false }]}
    ${[{ type: OutputType.Taproot, swapTree: '', cooperative: undefined }]}
    ${[{ type: OutputType.Taproot, swapTree: '', cooperative: null }]}
  `(
    'should not claim when uncooperative Taproot inputs do not have an internal key',
    ({ details }) => {
      expect(() =>
        constructClaimTransaction(
          details,
          p2trOutput(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey())),
          1n,
        ),
      ).toThrow('not all Taproot inputs have an internal key');
    },
  );

  test('should not claim FundingAddressTree (no claim leaf)', () => {
    const privateKey = secp256k1.utils.randomSecretKey();
    const publicKey = secp256k1.getPublicKey(privateKey);
    const tree = fundingAddressTree(false, publicKey, 800000);

    expect(() =>
      constructClaimTransaction(
        [
          {
            type: OutputType.Taproot,
            swapTree: tree,
            internalKey: toXOnly(publicKey),
            privateKey,
            preimage: randomBytes(32),
            transactionId: randomBytes(32).toString('hex'),
            vout: 0,
            script: p2trOutput(toXOnly(publicKey)),
            amount: 10000n,
          },
        ],
        p2trOutput(toXOnly(publicKey)),
        1000n,
      ),
    ).toThrow(Errors.claimRequiresClaimLeaf);
  });
});
