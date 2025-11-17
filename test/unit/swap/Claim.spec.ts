import { randomBytes } from 'crypto';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import type { ClaimDetails } from '../../../lib/consts/Types';
import { constructClaimTransaction } from '../../../lib/swap/Claim';
import { p2trOutput } from '../../../lib/swap/Scripts';
import { ECPair } from '../Utils';
import { claimDetails, claimDetailsMap } from './ClaimDetails';

describe('Claim', () => {
  const testClaim = (utxos: ClaimDetails[], fee: number) => {
    return constructClaimTransaction(
      utxos,
      getHexBuffer('00140000000000000000000000000000000000000000'),
      fee,
      false,
    );
  };

  test.each`
    type                        | fee    | name
    ${OutputType.Bech32}        | ${131} | ${'P2WSH'}
    ${OutputType.Compatibility} | ${166} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${274} | ${'P2SH'}
  `('should claim a $name swap', ({ type, fee }) => {
    expect(
      testClaim([claimDetailsMap.get(type)!], fee).toHex(),
    ).toMatchSnapshot();
  });

  test('should claim multiple swaps in one transaction', () => {
    expect(testClaim(claimDetails, 490).toHex()).toMatchSnapshot();
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
          p2trOutput(Buffer.from(ECPair.makeRandom().publicKey)),
          1,
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
          p2trOutput(Buffer.from(ECPair.makeRandom().publicKey)),
          1,
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
          p2trOutput(Buffer.from(ECPair.makeRandom().publicKey)),
          1,
        ),
      ).toThrow('not all Taproot inputs have an internal key');
    },
  );
});
