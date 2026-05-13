import { hex } from '@scure/base';

const compareTxids = (a: string, b: string): number => {
  const da = hex.decode(a);
  const db = hex.decode(b);

  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) {
      return da[i] - db[i];
    }
  }

  return 0;
};

export const compareInputs = (
  a: { transactionId: string; vout: number },
  b: { transactionId: string; vout: number },
): number => compareTxids(a.transactionId, b.transactionId) || a.vout - b.vout;

export const compareOutputs = (
  a: { amount: bigint | number; script: Uint8Array },
  b: { amount: bigint | number; script: Uint8Array },
): number => {
  const av = BigInt(a.amount);
  const bv = BigInt(b.amount);

  if (av !== bv) {
    return av < bv ? -1 : 1;
  }

  const sa = a.script;
  const sb = b.script;
  const len = Math.min(sa.length, sb.length);

  for (let i = 0; i < len; i++) {
    if (sa[i] !== sb[i]) {
      return sa[i] - sb[i];
    }
  }

  return sa.length - sb.length;
};
