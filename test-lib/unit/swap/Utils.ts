import { OutputType } from '../../../lib/consts/Enums';
import { p2wshOutput, p2shOutput, p2shP2wshOutput } from '../../../lib/swap/Scripts';

export const getScriptHashFunction = (type: OutputType) => {
  switch (type) {
    case OutputType.Bech32: return p2wshOutput;
    case OutputType.Legacy: return p2shOutput;
    case OutputType.Compatibility: return p2shP2wshOutput;
  }
};
