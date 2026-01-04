import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { type Secp256k1Interface, confidential } from 'liquidjs-lib';

export let secp: Secp256k1ZKP;
export let confidentialLiquid: confidential.Confidential;

export const init = (zkp: Secp256k1ZKP) => {
  secp = zkp;
  confidentialLiquid = new confidential.Confidential(
    secp as unknown as Secp256k1Interface,
  );
};
