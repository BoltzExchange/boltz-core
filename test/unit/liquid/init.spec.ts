import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { confidential } from 'liquidjs-lib';
import { confidentialLiquid, init, secp } from '../../../lib/liquid/init.ts';
import zkp from '../../zkp.ts';

describe('Liquid init', () => {
  let ourSecp: Secp256k1ZKP;

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
});
