import { initEccLib } from 'bitcoinjs-lib';
import type { TinySecp256k1Interface } from 'bitcoinjs-lib/src/types';

export const init = (eccLib: TinySecp256k1Interface) => initEccLib(eccLib);
