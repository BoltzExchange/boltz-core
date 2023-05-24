import zkp from '@vulpemventures/secp256k1-zkp';
import { claimSwap, createSwapOutput, elementsClient } from '../../Utils';
import { init } from '../../../../lib/liquid';
import { OutputType } from '../../../../lib/consts/Enums';
import { swapScript } from '../../../../lib/Boltz';

describe('Liquid SwapScript claim', () => {
  beforeAll(async () => {
    const [, secp] = await Promise.all([elementsClient.init(), zkp()]);
    init(secp);
  });

  afterAll(async () => {
    await elementsClient.generate(1);
  });

  test.each`
    type                        | name
    ${OutputType.Bech32}        | ${'P2WSH'}
    ${OutputType.Compatibility} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${'P2SH'}
  `(
    `should claim an unconfidential $name swap to an unconfidential output`,
    async ({ type }) => {
      const { utxo } = await createSwapOutput(type, false, swapScript);
      await claimSwap(utxo);
    },
  );
});
