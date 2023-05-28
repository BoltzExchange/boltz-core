import { confidential } from 'liquidjs-lib';
import zkp, { ZKP } from '@vulpemventures/secp256k1-zkp';
import {
  confidentialLiquid,
  ecpair,
  init,
  secp,
} from '../../../lib/liquid/Init';

describe('Liquid init', () => {
  let ourSecp: ZKP;

  beforeAll(async () => {
    ourSecp = await zkp();
  });

  test('should init', () => {
    init(ourSecp);
  });

  test('should set secp256k1 library', () => {
    expect(secp).toEqual(ourSecp);
  });

  test('should init Confidential class', () => {
    expect(confidentialLiquid).toBeInstanceOf(confidential.Confidential);
  });

  test('should init ECPair', () => {
    expect(ecpair).not.toBeUndefined();
  });
});
