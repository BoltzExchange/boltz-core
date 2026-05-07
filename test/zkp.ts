import zkpImport, { type Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';

type Init = typeof zkpImport.default;

const initZkp: Init =
  (zkpImport as { default?: Init }).default ?? (zkpImport as unknown as Init);

export type { Secp256k1ZKP };
export default initZkp;
