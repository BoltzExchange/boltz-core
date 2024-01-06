import { ECPairFactory } from 'ecpair';
import { SLIP77Factory } from 'slip77';
import * as ecc from 'tiny-secp256k1';

export const ECPair = ECPairFactory(ecc);

export const slip77 = SLIP77Factory(ecc).fromSeed(
  'evil elegant tent travel robust reflect donkey dream possible shrug bulb prefer',
);
