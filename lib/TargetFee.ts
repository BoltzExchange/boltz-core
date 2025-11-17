import type { Transaction } from 'bitcoinjs-lib';

interface ITransaction {
  ins: any[];
  virtualSize(discountCT?: boolean): number;
}

export const targetFee = <T extends ITransaction = Transaction>(
  satPerVbyte: number,
  constructTx: (fee: number) => T,
  discountCT = false,
): T => {
  const tx = constructTx(1);
  return constructTx(
    Math.ceil((tx.virtualSize(discountCT) + tx.ins.length) * satPerVbyte),
  );
};
