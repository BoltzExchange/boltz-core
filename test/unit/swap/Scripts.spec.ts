import {
  outputFunctionForType,
  p2pkhOutput,
  p2shOutput,
  p2shP2wpkhOutput,
  p2shP2wshOutput,
  p2wpkhOutput,
  p2wshOutput,
} from '../../../lib/swap/Scripts';
import { OutputType } from '../../../lib/consts/Enums';
import { getHexBuffer, getHexString } from '../../../lib/Utils';

describe('Scripts', () => {
  const publicKeyHash = getHexBuffer(
    '0000000000000000000000000000000000000000',
  );
  const redeemScript = getHexBuffer('00');

  test.each`
    scriptFunc         | input            | name
    ${p2wpkhOutput}    | ${publicKeyHash} | ${'P2WPKH'}
    ${p2wshOutput}     | ${redeemScript}  | ${'P2WSH'}
    ${p2pkhOutput}     | ${publicKeyHash} | ${'P2PKH'}
    ${p2shOutput}      | ${redeemScript}  | ${'P2SH'}
    ${p2shP2wshOutput} | ${redeemScript}  | ${'P2SH nested P2WSH'}
  `(`should get $name output script`, async ({ scriptFunc, input }) => {
    expect(getHexString(scriptFunc(input))).toMatchSnapshot();
  });

  test('should get P2SH nested P2WPKH output script', () => {
    expect(p2shP2wpkhOutput(publicKeyHash)).toMatchSnapshot();
  });

  test.each([
    [OutputType.Bech32, p2wshOutput],
    [OutputType.Compatibility, p2shP2wshOutput],
    [OutputType.Legacy, p2shOutput],
    [OutputType.Taproot, undefined],
    [42 as OutputType, undefined],
  ])(
    'should get correct SH function for output type %s',
    (type: OutputType, expectedFunc: typeof p2shOutput | undefined) => {
      expect(outputFunctionForType(type)).toEqual(expectedFunc);
    },
  );
});
