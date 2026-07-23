import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hex } from '@scure/base';
import { randomBytes } from 'node:crypto';
import { OutputType } from '../../../lib/consts/Enums.ts';
import type { RefundDetails } from '../../../lib/consts/Types.ts';
import { constructRefundTransaction } from '../../../lib/swap/Refund.ts';
import { p2trOutput } from '../../../lib/swap/Scripts.ts';
import swapTree from '../../../lib/swap/SwapTree.ts';
import { toXOnly } from '../../../lib/swap/TaprootUtils.ts';

describe('Refund', () => {
  const utxo = {
    transactionId:
      '54d761c76f5c22f4f93d48ddba27b9b7b5b5a962d5b424c279c623287e225d28',
    vout: 0,
    amount: 2000n,

    privateKey: hex.decode(
      'ddf1716bc8b16721ed31af7b05e6b8b68b373abd5996388fc1c279f821abd14b',
    ),
    redeemScript: Buffer.from(
      'a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac',
      'hex',
    ),
  };

  const refundDetails: RefundDetails[] = [
    {
      ...utxo,
      type: OutputType.Bech32,
      script: Buffer.from(
        '00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e',
        'hex',
      ),
    },
    {
      ...utxo,
      type: OutputType.Legacy,
      script: Buffer.from(
        'a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87',
        'hex',
      ),
    },
    {
      ...utxo,
      type: OutputType.Compatibility,
      script: Buffer.from(
        'a9148f439aff651860bdb28c66500c6e958cfbe7a69387',
        'hex',
      ),
    },
  ];

  const refundDetailsMap = new Map<OutputType, RefundDetails>(
    refundDetails.map((entry) => [entry.type, entry]),
  );

  const testRefund = (utxos: RefundDetails[], fee: number) => {
    return constructRefundTransaction(
      utxos,
      Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
      11,
      BigInt(fee),
    );
  };

  test.each`
    type                        | fee    | name
    ${OutputType.Bech32}        | ${127} | ${'P2WSH'}
    ${OutputType.Compatibility} | ${162} | ${'P2SH nested P2WSH'}
    ${OutputType.Legacy}        | ${258} | ${'P2SH'}
  `('should refund a $name swap', async ({ type, fee }) => {
    expect(
      testRefund([refundDetailsMap.get(type)!], fee).hex,
    ).toMatchSnapshot();
  });

  test('should refund multiple swaps in one transaction', () => {
    expect(testRefund(refundDetails, 466).hex).toMatchSnapshot();
  });

  test('should refund a Taproot swap via the script path', () => {
    const claimKeys = secp256k1.utils.randomSecretKey();
    const refundKeys = secp256k1.utils.randomSecretKey();
    const refundPublicKey = secp256k1.getPublicKey(refundKeys);

    const timeout = 11;
    const tree = swapTree(
      false,
      randomBytes(32),
      secp256k1.getPublicKey(claimKeys),
      refundPublicKey,
      timeout,
    );

    const refund = constructRefundTransaction(
      [
        {
          type: OutputType.Taproot,
          cooperative: false,
          swapTree: tree,
          internalKey: toXOnly(refundPublicKey),
          privateKey: refundKeys,
          script: p2trOutput(toXOnly(refundPublicKey)),
          amount: utxo.amount,
          vout: utxo.vout,
          transactionId: utxo.transactionId,
        },
      ],
      Buffer.from('00140000000000000000000000000000000000000000', 'hex'),
      timeout,
      1n,
    );

    expect(refund.inputsLength).toEqual(1);
    expect(refund.outputsLength).toEqual(1);
    expect(refund.lockTime).toEqual(timeout);

    // A script path refund reveals the refund leaf in the witness:
    // [signature, leaf script, control block]
    const witness = refund.getInput(0).finalScriptWitness!;
    expect(witness).toHaveLength(3);
    expect(Buffer.from(witness[1])).toEqual(
      Buffer.from(tree.refundLeaf.output),
    );
  });

  test('should sort inputs by BIP69 regardless of caller-provided order', () => {
    const base = refundDetailsMap.get(OutputType.Bech32)!;
    const txids = [
      '28e0fdd185542f2c6ea19030b0796051e7772b6026dd5ddccd7a2f93b73e6fc2',
      '26aa6e6d8b9e49bb0630aac301db6757c02e3619feb4ee0eea81eb1672947024',
      '0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57',
    ];
    const shuffled = txids.map((transactionId) => ({ ...base, transactionId }));
    const preSorted = [...shuffled].reverse();

    expect(testRefund(shuffled, 466).hex).toEqual(
      testRefund(preSorted, 466).hex,
    );
    expect(testRefund(shuffled, 466).hex).toMatchSnapshot();
  });
});
