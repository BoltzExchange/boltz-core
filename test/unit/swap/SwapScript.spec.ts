import { getHexBuffer, getHexString } from '../../../lib/Utils';
import swapScript from '../../../lib/swap/SwapScript';

describe('SwapScript', () => {
  test('should get a swap script', () => {
    const preimageHash = getHexBuffer(
      '53ada8e6de01c26ff43040887ba7b22bddce19f8658fd1ba00716ed79d15cd5e',
    );
    const destinationPublicKey = getHexBuffer(
      '03f8109578aae1e5cfc497e466cf6ae6625497cd31886e87b2f4f54f3f0f46b539',
    );
    const refundPublicKey = getHexBuffer(
      '03ec0c1e45b709d708cd376a6f2daf19ac27be229647780d592e27d7fb7efb207a',
    );
    const timeoutBlockHeight = 515924;

    const result = swapScript(
      preimageHash,
      destinationPublicKey,
      refundPublicKey,
      timeoutBlockHeight,
    );

    expect(getHexString(result)).toMatchSnapshot();
  });
});
