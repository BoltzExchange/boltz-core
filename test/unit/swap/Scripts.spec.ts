import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { getHexBuffer, getHexString } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import {
  outputFunctionForType,
  p2pkhOutput,
  p2shOutput,
  p2shP2wpkhOutput,
  p2shP2wshOutput,
  p2trOutput,
  p2wpkhOutput,
  p2wshOutput,
} from '../../../lib/swap/Scripts';

describe('Scripts', () => {
  const key = toXOnly(
    getHexBuffer(
      '75cba84f97d7af95da496b15b34c205003aea7f0daf6b6762beec29dae5e466c',
    ),
  );
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
    ${p2trOutput}      | ${key}           | ${'P2TR'}
  `('should get $name output script', async ({ scriptFunc, input }) => {
    expect(getHexString(scriptFunc(input))).toMatchSnapshot();
  });

  test('should get P2SH nested P2WPKH output script', () => {
    expect(p2shP2wpkhOutput(publicKeyHash)).toMatchSnapshot();
  });

  test.each([
    [OutputType.Bech32, p2wshOutput],
    [OutputType.Compatibility, p2shP2wshOutput],
    [OutputType.Legacy, p2shOutput],
    [OutputType.Taproot, p2trOutput],
    [42 as OutputType, undefined],
  ])(
    'should get correct SH function for output type %s',
    (type: OutputType, expectedFunc: any) => {
      expect(outputFunctionForType(type)).toEqual(expectedFunc);
    },
  );
});
