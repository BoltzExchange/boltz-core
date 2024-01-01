import { ECPair } from '../Utils';
import swapTree from '../../../lib/swap/SwapTree';
import { getHexBuffer } from '../../../lib/Utils';
import {
  deserializeSwapTree,
  serializeSwapTree,
} from '../../../lib/swap/SwapTreeSerializer';

describe('SwapTreeSerializer', () => {
  const createTree = (isLiquid: boolean) =>
    swapTree(
      isLiquid,
      getHexBuffer(
        'a8aca40d423f00ec0a69b1b815169d7412a747e08e5669e80b3106e82975908a',
      ),
      ECPair.fromPrivateKey(
        getHexBuffer(
          '4cffad3235065eff2959eabeb36cccaed698bc5a009d43f2ca1ce2d251599f85',
        ),
      ).publicKey,
      ECPair.fromPrivateKey(
        getHexBuffer(
          'eb4036423cd9ae6eaa44eb7203047c613aa2c6f52153b6783d53fa4e19173af1',
        ),
      ).publicKey,
      123,
    );

  test.each`
    isLiquid
    ${false}
    ${true}
  `('should serialize swap trees (isLiquid: $isLiquid)', ({ isLiquid }) => {
    const serialized = serializeSwapTree(createTree(isLiquid));
    expect(serialized).toMatchSnapshot();
  });

  test.each`
    isLiquid
    ${false}
    ${true}
  `('should deserialize swap trees (isLiquid: $isLiquid)', ({ isLiquid }) => {
    const tree = createTree(isLiquid);

    const serialized = serializeSwapTree(tree);
    expect(deserializeSwapTree(serialized)).toEqual(tree);
  });

  test.each`
    isLiquid
    ${false}
    ${true}
  `(
    'should deserialize stringified swap trees (isLiquid: $isLiquid)',
    ({ isLiquid }) => {
      const tree = createTree(isLiquid);

      const serialized = JSON.stringify(serializeSwapTree(tree));
      expect(deserializeSwapTree(serialized)).toEqual(tree);
    },
  );
});
