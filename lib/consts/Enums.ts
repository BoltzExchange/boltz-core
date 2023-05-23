export enum OutputType {
  Bech32 = 0,
  Compatibility = 1,
  Legacy = 2,
  Taproot = 3,
}

export type Output = {
  type: OutputType;
  isSh?: boolean;
};
