import bitcoinOpsImport from '@boltz/bitcoin-ops';

type Ops = typeof bitcoinOpsImport.default;

const ops: Ops =
  (bitcoinOpsImport as { default?: Ops }).default ??
  (bitcoinOpsImport as unknown as Ops);

export default ops;
