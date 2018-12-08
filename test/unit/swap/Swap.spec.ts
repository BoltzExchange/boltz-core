// tslint:disable:max-line-length
import { expect } from 'chai';
import { crypto } from 'bitcoinjs-lib';
import { pkRefundSwap, pkHashRefundSwap } from '../../../lib/swap/Swap';
import { getHexString, getHexBuffer } from '../../../lib/Utils';

describe('Swaps', () => {
  const preimageHash = getHexBuffer('53ada8e6de01c26ff43040887ba7b22bddce19f8658fd1ba00716ed79d15cd5e');
  const destinationPublicKey = getHexBuffer('03f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539');

  const refundPublicKey = getHexBuffer('03ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a');
  const refundPublicKeyHash = crypto.hash160(refundPublicKey);

  const timeoutBlockHeight = 515924;

  it('should generate a redeem script with a public key refund path', () => {
    const testData = {
      args: {
        preimageHash,
        destinationPublicKey,
        refundPublicKey,
        timeoutBlockHeight,
      },
      result: 'a914e2ac8cb97af3d59b1c057db4b0c4f9aa12a9127387632103f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539670354df07b1752103ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a68ac',
    };

    const result = pkRefundSwap(
      testData.args.preimageHash,
      testData.args.destinationPublicKey,
      testData.args.refundPublicKey,
      testData.args.timeoutBlockHeight,
    );

    expect(getHexString(result)).to.be.equal(testData.result);
  });

  it('should generate a redeem script with a public key hash refund path', () => {
    const testData = {
      args: {
        preimageHash,
        destinationPublicKey,
        refundPublicKeyHash,
        timeoutBlockHeight,
      },
      result: '76a914e2ac8cb97af3d59b1c057db4b0c4f9aa12a912738763752103f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539670354df07b17576a914ce99030daa71c4dfb155de212e475284d7a2cedb8868ac',
    };

    const result = pkHashRefundSwap(
      testData.args.preimageHash,
      testData.args.destinationPublicKey,
      testData.args.refundPublicKeyHash,
      testData.args.timeoutBlockHeight,
    );

    expect(getHexString(result)).to.be.equal(testData.result);
  });
});
