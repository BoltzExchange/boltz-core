import { hex } from '@scure/base';
import { compareInputs, compareOutputs } from '../../../lib/swap/Bip69.ts';

// Canonical BIP69 reference transaction with 17 inputs.
// https://github.com/bitcoin/bips/blob/master/bip-0069.mediawiki
// tx 0a6a357e2f7796444e02638749d9611c008b253fb55f5dc88b739b230ed0c4c3
const canonicalInputOrder = [
  ['0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57', 0],
  ['26aa6e6d8b9e49bb0630aac301db6757c02e3619feb4ee0eea81eb1672947024', 1],
  ['28e0fdd185542f2c6ea19030b0796051e7772b6026dd5ddccd7a2f93b73e6fc2', 0],
  ['381de9b9ae1a94d9c17f6a08ef9d341a5ce29e2e60c36a52d333ff6203e58d5d', 1],
  ['3b8b2f8efceb60ba78ca8bba206a137f14cb5ea4035e761ee204302d46b98de2', 0],
  ['402b2c02411720bf409eff60d05adad684f135838962823f3614cc657dd7bc0a', 1],
  ['54ffff182965ed0957dba1239c27164ace5a73c9b62a660c74b7b7f15ff61e7a', 1],
  ['643e5f4e66373a57251fb173151e838ccd27d279aca882997e005016bb53d5aa', 0],
  ['6c1d56f31b2de4bfc6aaea28396b333102b1f600da9c6d6149e96ca43f1102b1', 1],
  ['7a1de137cbafb5c70405455c49c5104ca3057a1f1243e6563bb9245c9c88c191', 0],
  ['7d037ceb2ee0dc03e82f17be7935d238b35d1deabf953a892a4507bfbeeb3ba4', 1],
  ['a5e899dddb28776ea9ddac0a502316d53a4a3fca607c72f66c470e0412e34086', 0],
  ['b4112b8f900a7ca0c8b0e7c4dfad35c6be5f6be46b3458974988e1cdb2fa61b8', 0],
  ['bafd65e3c7f3f9fdfdc1ddb026131b278c3be1af90a4a6ffa78c4658f9ec0c85', 0],
  ['de0411a1e97484a2804ff1dbde260ac19de841bebad1880c782941aca883b4e9', 1],
  ['f0a130a84912d03c1d284974f563c5949ac13f8342b8112edff52971599e6a45', 0],
  ['f320832a9d2e2452af63154bc687493484a0e7745ebd3aaf9ca19eb80834ad60', 0],
] as const;

const toInput = ([transactionId, vout]: readonly [string, number]) => ({
  transactionId,
  vout,
});

describe('Bip69', () => {
  describe('compareInputs', () => {
    test('sorts the canonical 17-input vector from a shuffled order', () => {
      const expected = canonicalInputOrder.map(toInput);
      const shuffled = [...expected].reverse();
      const sorted = [...shuffled].sort(compareInputs);
      expect(sorted).toEqual(expected);
    });

    test('breaks ties on vout when txids match (28204cad vector)', () => {
      const sameTxid =
        '35288d269cee1941eaebb2ea85e32b42cdb2b04284a56d8b14dcc3f5c65d6055';
      const sorted = [
        { transactionId: sameTxid, vout: 1 },
        { transactionId: sameTxid, vout: 0 },
      ].sort(compareInputs);
      expect(sorted).toEqual([
        { transactionId: sameTxid, vout: 0 },
        { transactionId: sameTxid, vout: 1 },
      ]);
    });

    test('is case-insensitive on hex input', () => {
      const lower =
        '0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57';
      const upper = lower.toUpperCase();
      expect(
        compareInputs(
          { transactionId: lower, vout: 0 },
          { transactionId: upper, vout: 0 },
        ),
      ).toEqual(0);
    });

    test('returns 0 for fully equal inputs', () => {
      const a = {
        transactionId:
          '0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57',
        vout: 3,
      };
      expect(compareInputs(a, { ...a })).toEqual(0);
    });
  });

  describe('compareOutputs', () => {
    test('sorts by amount ascending (28204cad vector)', () => {
      const big = {
        amount: 2_400_000_000n,
        script: hex.decode('41044a656f'),
      };
      const small = {
        amount: 100_000_000n,
        script: hex.decode('41046a0765'),
      };
      const sorted = [big, small].sort(compareOutputs);
      expect(sorted).toEqual([small, big]);
    });

    test('breaks ties on scriptPubKey lex order when amounts match', () => {
      const a = { amount: 1_000n, script: Uint8Array.of(0x01, 0x02) };
      const b = { amount: 1_000n, script: Uint8Array.of(0x01, 0x03) };
      expect([b, a].sort(compareOutputs)).toEqual([a, b]);
    });

    test('shorter script sorts before a longer prefix-equal script', () => {
      const short = { amount: 1n, script: Uint8Array.of(0x01) };
      const long = { amount: 1n, script: Uint8Array.of(0x01, 0x00) };
      expect([long, short].sort(compareOutputs)).toEqual([short, long]);
    });

    test('accepts number-typed amounts', () => {
      const sorted = [
        { amount: 500, script: Uint8Array.of(0xaa) },
        { amount: 1, script: Uint8Array.of(0xbb) },
      ].sort(compareOutputs);
      expect(sorted[0].amount).toEqual(1);
      expect(sorted[1].amount).toEqual(500);
    });
  });
});
