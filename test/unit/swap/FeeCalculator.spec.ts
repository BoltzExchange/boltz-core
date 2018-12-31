// tslint:disable:max-line-length
import { expect } from 'chai';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import { estimateFee } from '../../../lib/FeeCalculator';

const redeemScript = getHexBuffer('a914e2ac8cb97af3d59b1c057db4b0c4f9aa12a9127387632103f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539670354df07b1752103ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a68ac');

describe('FeeCalculator', () => {
  it('should estimate fee for PKH inputs and outputs correctly', () => {
    const allTypesArray = [
      { type: OutputType.Bech32 },
      { type: OutputType.Compatibility },
      { type: OutputType.Legacy },
    ];

    const result = estimateFee(1, allTypesArray, allTypesArray);
    expect(result).to.be.equal(414);
  });

  it('should estimate fee for swap claim inputs correctly', () => {
    const swapDetails = {
      redeemScript,
      preimage: getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c'),
    };

    const result = estimateFee(1, [
      {
        swapDetails,
        type: OutputType.Bech32,
      },
      {
        swapDetails,
        type: OutputType.Compatibility,
      },
      {
        swapDetails,
        type: OutputType.Legacy,
      },
    ], []);
    expect(result).to.be.equal(461);
  });

  it('should estimate fee for swap refund inputs correctly', () => {
    const result = estimateFee(1, [
      {
        type: OutputType.Bech32,
        swapDetails: {
          redeemScript,
        },
      },
      {
        type: OutputType.Compatibility,
        swapDetails: {
          redeemScript,
        },
      },
      {
        type: OutputType.Legacy,
        swapDetails: {
          redeemScript,
        },
      },
    ], []);
    expect(result).to.be.equal(435);
  });

  it('should estimate fee for SH ouputs correctly', () => {
    const allTypesArray = [
      {
        type: OutputType.Bech32,
        isSh: true,
      },
      {
        type: OutputType.Compatibility,
        isSh: true,
      },
      {
        type: OutputType.Legacy,
        isSh: true,
      },
    ];

    const result = estimateFee(1, [], allTypesArray);
    expect(result).to.be.equal(116);
  });
});
