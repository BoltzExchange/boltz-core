import { getHexBuffer, getHexString } from '../../../lib/Utils';
import reverseSwapScript from '../../../lib/swap/ReverseSwapScript';

describe('ReverseSwapScript', () => {
  test('should get a reverse swap script', () => {
    const preimageHash = getHexBuffer(
      'e5a211aa15cc91def065a1bf09f878991faeb9504d8606f645ec620cb9c09f1f',
    );
    const destinationPublicKey = getHexBuffer(
      '03f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539',
    );
    const refundPublicKey = getHexBuffer(
      '03ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a',
    );
    const timeoutBlockHeight = 515924;

    const result = reverseSwapScript(
      preimageHash,
      destinationPublicKey,
      refundPublicKey,
      timeoutBlockHeight,
    );

    expect(getHexString(result)).toMatchSnapshot();
  });
});
