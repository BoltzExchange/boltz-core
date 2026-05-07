import { reverseSwapScript, swapScript } from '../../../../lib/Boltz.ts';
import { OutputType } from '../../../../lib/consts/Enums.ts';
import type { LiquidClaimDetails } from '../../../../lib/liquid/index.ts';
import { init } from '../../../../lib/liquid/index.ts';
import { slip77 } from '../../../unit/Utils.ts';
import zkp, { type Secp256k1ZKP } from '../../../zkp.ts';
import {
  createSwapOutput,
  destinationOutput,
  elementsClient,
  refundSwap,
  init as utilsInit,
} from '../../Utils.ts';

describe.each`
  script               | name                   | swapName
  ${swapScript}        | ${'SwapScript'}        | ${'swap'}
  ${reverseSwapScript} | ${'ReverseSwapScript'} | ${'reverse swap'}
`('Liquid $name refund', ({ script, swapName }) => {
  let secpZkp: Secp256k1ZKP;
  let bestBlockHeight: number;

  beforeAll(async () => {
    const [, secp] = await Promise.all([
      elementsClient.init(),
      zkp(),
      utilsInit(),
    ]);
    init(secp);

    bestBlockHeight = (await elementsClient.getBlockchainInfo()).blocks;
    secpZkp = secp;
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
    `should refund a confidential ($blindInputs) $name ${swapName} to a confidential ($blindOutput) output`,
    async ({ type, blindInputs, blindOutput }) => {
      const { utxo } = await createSwapOutput<LiquidClaimDetails>(
        type,
        true,
        script,
        bestBlockHeight,
        blindInputs,
      );
      await refundSwap(
        [utxo],
        bestBlockHeight,
        blindOutput
          ? slip77(secpZkp).derive(Buffer.from(destinationOutput)).publicKey!
          : undefined,
      );
    },
  );

  test.each`
    type                 | blindInputs | blindOutput | name
    ${OutputType.Bech32} | ${false}    | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${false}    | ${'P2WSH'}
    ${OutputType.Bech32} | ${true}     | ${true}     | ${'P2WSH'}
  `(
    `should refund multiple confidential ($blindInputs) $name ${swapName}s to a confidential ($blindOutput) output`,
    async ({ type, blindInputs, blindOutput }) => {
      const utxos: LiquidClaimDetails[] = [];

      for (let i = 0; i < 3; i++) {
        const { utxo } = await createSwapOutput<LiquidClaimDetails>(
          type,
          true,
          script,
          bestBlockHeight,
          blindInputs,
        );
        utxos.push(utxo);
      }
      await refundSwap(
        utxos,
        bestBlockHeight,
        blindOutput
          ? slip77(secpZkp).derive(Buffer.from(destinationOutput)).publicKey!
          : undefined,
      );
    },
  );
});
