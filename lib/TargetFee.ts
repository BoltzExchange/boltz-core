import { Transaction } from 'bitcoinjs-lib';

interface ITransaction {
  virtualSize(): number;
}

export const targetFee = <T extends ITransaction = Transaction>(
  satPerVbyte: number,
  constructTx: (fee: number) => T,
): T => {
  const tx = constructTx(1);
  return constructTx(Math.ceil(tx.virtualSize() * satPerVbyte + 1));
};
