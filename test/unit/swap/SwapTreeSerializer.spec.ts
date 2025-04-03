import { getHexBuffer } from '../../../lib/Utils';
import { Feature, Networks, reverseSwapTree } from '../../../lib/liquid';
import { p2trOutput } from '../../../lib/swap/Scripts';
import swapTree from '../../../lib/swap/SwapTree';
import {
  deserializeSwapTree,
  serializeSwapTree,
} from '../../../lib/swap/SwapTreeSerializer';
import { ECPair } from '../Utils';

describe('SwapTreeSerializer', () => {
  const preimageHash = getHexBuffer(
    'a8aca40d423f00ec0a69b1b815169d7412a747e08e5669e80b3106e82975908a',
  );
  const claimPublicKey = Buffer.from(
    ECPair.fromPrivateKey(
      getHexBuffer(
        '4cffad3235065eff2959eabeb36cccaed698bc5a009d43f2ca1ce2d251599f85',
      ),
    ).publicKey,
  );
  const refundPublicKey = Buffer.from(
    ECPair.fromPrivateKey(
      getHexBuffer(
        'eb4036423cd9ae6eaa44eb7203047c613aa2c6f52153b6783d53fa4e19173af1',
      ),
    ).publicKey,
  );
  const timeoutBlockHeight = 123;

  const createTree = (isLiquid: boolean) =>
    swapTree(
      isLiquid,
      preimageHash,
      claimPublicKey,
      refundPublicKey,
      timeoutBlockHeight,
    );

  const createTreeWithCovenant = () =>
    reverseSwapTree(
      preimageHash,
      claimPublicKey,
      refundPublicKey,
      timeoutBlockHeight,
      [
        {
          type: Feature.ClaimCovenant,
          expectedAmount: 100_000,
          assetHash: Networks.liquidRegtest.assetHash,
          outputScript: p2trOutput(claimPublicKey),
        },
      ],
    );

  test.each`
    isLiquid
    ${false}
    ${true}
  `('should serialize swap tree (isLiquid: $isLiquid)', ({ isLiquid }) => {
    const serialized = serializeSwapTree(createTree(isLiquid));
    expect(serialized).toMatchSnapshot();
  });

  test('should serialize swap tree with covenant', () => {
    const serialized = serializeSwapTree(createTreeWithCovenant());
    expect(serialized).toMatchSnapshot();
  });

  test.each`
    isLiquid
    ${false}
    ${true}
  `('should deserialize swap tree (isLiquid: $isLiquid)', ({ isLiquid }) => {
    const tree = createTree(isLiquid);

    const serialized = serializeSwapTree(tree);
    expect(deserializeSwapTree(serialized)).toEqual(tree);
  });

  test('should deserialize swap tree with covenant', () => {
    const tree = createTreeWithCovenant();

    const serialized = serializeSwapTree(tree);
    expect(deserializeSwapTree(serialized)).toEqual(tree);
  });

  test.each`
    isLiquid
    ${false}
    ${true}
  `(
    'should deserialize string swap trees (isLiquid: $isLiquid)',
    ({ isLiquid }) => {
      const tree = createTree(isLiquid);

      const serialized = JSON.stringify(serializeSwapTree(tree));
      expect(deserializeSwapTree(serialized)).toEqual(tree);
    },
  );
});
