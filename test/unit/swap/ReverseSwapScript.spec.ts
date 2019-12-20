// tslint:disable:max-line-length
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';
import { getHexString, getHexBuffer } from '../../../lib/Utils';

describe('ReverseSwapScript', () => {
  const preimageHash = getHexBuffer('e5a211aa15cc91def065a1bf09f878991faeb9504d8606f645ec620cb9c09f1f');
  const destinationPublicKey = getHexBuffer('03f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539');

  const refundPublicKey = getHexBuffer('03ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a');

  const timeoutBlockHeight = 515924;

  test('should get a reverse swap script', () => {
    const testData = {
      args: {
        preimageHash,
        destinationPublicKey,
        refundPublicKey,
        timeoutBlockHeight,
      },
      result: '8201208763a9144eee61c39e3b6d46f6fc7da6ae80519aa681f6d2882103f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b53967750354df07b1752103ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a68ac',
    };

    const result = reverseSwapScript(
      testData.args.preimageHash,
      testData.args.destinationPublicKey,
      testData.args.refundPublicKey,
      testData.args.timeoutBlockHeight,
    );

    expect(getHexString(result)).toEqual(testData.result);
  });
});
