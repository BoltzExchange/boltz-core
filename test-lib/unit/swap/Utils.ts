import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import Errors from '../../../lib/consts/Errors';
import { OutputType } from '../../../lib/consts/Enums';
import { p2wshOutput, p2shOutput, p2shP2wshOutput } from '../../../lib/swap/Scripts';

export const ECPair = ECPairFactory(ecc);

export const getScriptHashFunction = (type: OutputType): (scriptHex: Buffer) => Buffer => {
  switch (type) {
    case OutputType.Bech32: return p2wshOutput;
    case OutputType.Legacy: return p2shOutput;
    case OutputType.Compatibility: return p2shP2wshOutput;
    case OutputType.Taproot: throw Errors.TAPROOT_NOT_SUPPORTED;
  }
};
