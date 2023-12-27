import zkp from '@michael1011/secp256k1-zkp';
import { slip77 } from '../../../unit/Utils';
import { OutputType } from '../../../../lib/consts/Enums';
import { init, LiquidClaimDetails } from '../../../../lib/liquid';
import { reverseSwapScript, swapScript } from '../../../../lib/Boltz';
import {
  claimSwap,
  createSwapOutput,
  destinationOutput,
  elementsClient,
} from '../../Utils';

describe.each`
  script               | name                   | swapName
  ${swapScript}        | ${'SwapScript'}        | ${'swap'}
  ${reverseSwapScript} | ${'ReverseSwapScript'} | ${'reverse swap'}
`('Liquid $name claim', ({ script, swapName }) => {
  beforeAll(async () => {
    const [, secp] = await Promise.all([elementsClient.init(), zkp()]);
    init(secp);
  });

  afterEach(async () => {
    await elementsClient.generate(1);
  });

  test.each`
    type                 | blindInputs | blindOutput | name
    ${OutputType.Bech32} | ${false}    | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${true}     | ${'P2WSH'}
  `(
    `should claim a confidential ($blindInputs) $name ${swapName} to a confidential ($blindOutput) output`,
    async ({ type, blindInputs, blindOutput }) => {
      const { utxo } = await createSwapOutput<LiquidClaimDetails>(
        type,
        false,
        script,
        undefined,
        blindInputs,
      );
      await claimSwap(
        [utxo],
        blindOutput ? slip77.derive(destinationOutput).publicKey! : undefined,
      );
    },
  );

  test.each`
    type                 | blindInputs | blindOutput | name
    ${OutputType.Bech32} | ${false}    | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${true}     | ${'P2WSH'}
  `(
    `should claim multiple confidential ($blindInputs) $name ${swapName}s to a confidential ($blindOutput) output`,
    async ({ type, blindInputs, blindOutput }) => {
      const utxos: LiquidClaimDetails[] = [];

      for (let i = 0; i < 3; i++) {
        const { utxo } = await createSwapOutput<LiquidClaimDetails>(
          type,
          false,
          script,
          undefined,
          blindInputs,
        );
        utxos.push(utxo);
      }
      await claimSwap(
        utxos,
        blindOutput ? slip77.derive(destinationOutput).publicKey! : undefined,
      );
    },
  );
});
