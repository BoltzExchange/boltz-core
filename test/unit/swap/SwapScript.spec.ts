// tslint:disable:max-line-length
import swapScript from '../../../lib/swap/SwapScript';
import { getHexString, getHexBuffer } from '../../../lib/Utils';

describe('SwapScript', () => {
  const preimageHash = getHexBuffer('53ada8e6de01c26ff43040887ba7b22bddce19f8658fd1ba00716ed79d15cd5e');
  const destinationPublicKey = getHexBuffer('03f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539');

  const refundPublicKey = getHexBuffer('03ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a');

  const timeoutBlockHeight = 515924;

  test('should get a swap script', () => {
    const testData = {
      args: {
        preimageHash,
        destinationPublicKey,
        refundPublicKey,
        timeoutBlockHeight,
      },
      result: 'a914e2ac8cb97af3d59b1c057db4b0c4f9aa12a9127387632103f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539670354df07b1752103ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a68ac',
    };

    const result = swapScript(
      testData.args.preimageHash,
      testData.args.destinationPublicKey,
      testData.args.refundPublicKey,
      testData.args.timeoutBlockHeight,
    );

    expect(getHexString(result)).toEqual(testData.result);
  });
});
