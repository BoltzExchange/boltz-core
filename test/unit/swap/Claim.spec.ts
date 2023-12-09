import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import { ClaimDetails } from '../../../lib/consts/Types';
import { claimDetails, claimDetailsMap } from './ClaimDetails';
import { constructClaimTransaction } from '../../../lib/swap/Claim';

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
  `(`should claim a $name swap`, ({ type, fee }) => {
    expect(
      testClaim([claimDetailsMap.get(type)!], fee).toHex(),
    ).toMatchSnapshot();
  });

  test('should claim multiple swaps in one transaction', () => {
    expect(testClaim(claimDetails, 490).toHex()).toMatchSnapshot();
  });
});
