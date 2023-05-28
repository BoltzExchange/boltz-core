import { Transaction } from 'bitcoinjs-lib';

interface ITransaction {
  ins: any[];
  virtualSize(): number;
}

export const targetFee = <T extends ITransaction = Transaction>(
  satPerVbyte: number,
  constructTx: (fee: number) => T,
): T => {
  const tx = constructTx(1);
  return constructTx(
    Math.ceil((tx.virtualSize() + tx.ins.length) * satPerVbyte),
  );
};
