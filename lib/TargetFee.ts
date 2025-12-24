interface ITransaction {
  ins: any[];
  virtualSize(discountCT?: boolean): number;
}

interface INobleTransaction {
  vsize: number;
  inputsLength: number;
}

export const targetFee = <T extends ITransaction | INobleTransaction>(
  satPerVbyte: number,
  constructTx: (fee: bigint) => T,
  discountCT = false,
): T => {
  const tx = constructTx(BigInt(1));

  const isITransaction = 'ins' in tx;

  const vsize = isITransaction
    ? (tx as ITransaction).virtualSize(discountCT)
    : (tx as INobleTransaction).vsize;

  const inputsLength = isITransaction
    ? (tx as ITransaction).ins.length
    : (tx as INobleTransaction).inputsLength;

  return constructTx(BigInt(Math.ceil((vsize + inputsLength) * satPerVbyte)));
};
