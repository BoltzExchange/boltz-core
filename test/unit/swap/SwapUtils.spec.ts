import ops from '@boltz/bitcoin-ops';
import { Transaction, crypto } from 'bitcoinjs-lib';
import { getHexBuffer, getHexString } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import {
  p2pkhOutput,
  p2shOutput,
  p2shP2wpkhOutput,
  p2shP2wshOutput,
  p2trOutput,
  p2wpkhOutput,
  p2wshOutput,
} from '../../../lib/swap/Scripts';
import {
  encodeCltv,
  encodeSignature,
  getOutputScriptType,
  scriptBuffersToScript,
  toPushdataScript,
} from '../../../lib/swap/SwapUtils';

describe('SwapUtils', () => {
  const publicKeyHash = getHexBuffer(
    '0000000000000000000000000000000000000000',
  );

  test.each`
    signature                                                                                                                             | flag
    ${'4e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd41181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d09'} | ${Transaction.SIGHASH_ALL}
    ${'82235e21a2300022738dabb8e1bbd9d19cfb1e7ab8c30a23b0afbb8d178abcf324bf68e256c534ddfaf966bf908deb944305596f7bdcc38d69acad7f9c868724'} | ${Transaction.SIGHASH_ALL}
    ${'1cadddc2838598fee7dc35a12b340c6bde8b389f7bfd19a1252a17c4b5ed2d71c1a251bbecb14b058a8bd77f65de87e51c47e95904f4c0e9d52eddc21c1415ac'} | ${Transaction.SIGHASH_ALL}
    ${'1b19519b38ca1e6813cd25649ad36be8bc6a6f2ad9758089c429acd9ce0b572f3bf32193c8a3a3de1f847cd6e6eebf43c96df1ffa4d7fe920f8f71708920c65f'} | ${Transaction.SIGHASH_ALL}
  `('should encode signature $signature', ({ signature, flag }) => {
    const result = encodeSignature(flag, getHexBuffer(signature));
    expect(getHexString(result)).toMatchSnapshot();
  });

  test('should get formed scripts', () => {
    const result = scriptBuffersToScript([publicKeyHash, ops.OP_PUSHDATA1]);
    expect(getHexString(result)).toMatchSnapshot();
  });

  test('should get formed pushdata scripts', () => {
    const result = toPushdataScript([
      ops.OP_HASH160,
      crypto.hash160(publicKeyHash),
      ops.OP_EQUALVERIFY,
    ]);
    expect(getHexString(result)).toMatchSnapshot();
  });

  test.each`
    output                             | expected                                     | name
    ${p2wpkhOutput(publicKeyHash)}     | ${{ type: OutputType.Bech32, isSh: false }}  | ${'P2WKH'}
    ${p2pkhOutput(publicKeyHash)}      | ${{ type: OutputType.Legacy, isSh: false }}  | ${'P2PKH'}
    ${p2wshOutput(publicKeyHash)}      | ${{ type: OutputType.Bech32, isSh: true }}   | ${'P2WSH'}
    ${p2shOutput(publicKeyHash)}       | ${{ type: OutputType.Legacy, isSh: true }}   | ${'P2SH'}
    ${p2shP2wpkhOutput(publicKeyHash)} | ${{ type: OutputType.Legacy, isSh: true }}   | ${'P2SH nested P2WPKH'}
    ${p2shP2wshOutput(publicKeyHash)}  | ${{ type: OutputType.Legacy, isSh: true }}   | ${'P2SH nested P2WSH'}
    ${p2trOutput(publicKeyHash)}       | ${{ type: OutputType.Taproot, isSh: false }} | ${'P2TR'}
    ${[ops.OP_INVALIDOPCODE]}          | ${undefined}                                 | ${'OP_INVALIDOPCODE'}
    ${[ops.OP_RETURN]}                 | ${undefined}                                 | ${'OP_RETURN'}
  `(
    'should get the correct output type of $name output scripts',
    ({ output, expected }) => {
      expect(getOutputScriptType(output.outputScript || output)).toEqual(
        expected,
      );
    },
  );

  test.each([608861, 123, 321, 2345234, 790926])(
    'should encode CLTV @ block number %p',
    (blockHeight: number) => {
      expect(getHexString(encodeCltv(blockHeight))).toMatchSnapshot();
    },
  );
});
