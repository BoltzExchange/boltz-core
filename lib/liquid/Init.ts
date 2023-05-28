import { confidential } from 'liquidjs-lib';
import { ECPairAPI, ECPairFactory } from 'ecpair';
import { ZKP } from '@vulpemventures/secp256k1-zkp';

export let secp: ZKP;
export let ecpair: ECPairAPI;
export let confidentialLiquid: confidential.Confidential;

export const init = (zkp: ZKP) => {
  secp = zkp;
  ecpair = ECPairFactory(secp.ecc);
  confidentialLiquid = new confidential.Confidential(secp);
};
