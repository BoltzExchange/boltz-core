import { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { ECPairAPI, ECPairFactory } from 'ecpair';
import { confidential } from 'liquidjs-lib';

export let secp: Secp256k1ZKP;
export let ecpair: ECPairAPI;
export let confidentialLiquid: confidential.Confidential;

export const init = (zkp: Secp256k1ZKP) => {
  secp = zkp;
  ecpair = ECPairFactory(secp.ecc);
  confidentialLiquid = new confidential.Confidential(secp as any);
};
