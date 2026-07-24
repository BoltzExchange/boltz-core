import { sha256 } from '@noble/hashes/sha2.js';
import { Script, Transaction } from '@scure/btc-signer';
import { equalBytes } from '@scure/btc-signer/utils.js';

type BitcoinJsStyleInput = { script?: Uint8Array; witness?: Uint8Array[] };

/**
 * Detects the preimage revealed by a claim transaction input
 *
 * Rather than relying on the position of the preimage in the witness or input
 * script, the element that actually hashes to {@link preimageHash} is returned.
 * This makes detection robust against unexpected witness layouts and returns
 * `undefined` for inputs that do not reveal the preimage (e.g. cooperative or
 * refund spends).
 *
 * @param vin index of the input to inspect
 * @param claimTransaction transaction that claims the swap
 * @param preimageHash SHA256 hash of the preimage (i.e. the payment hash)
 * @returns the preimage, or `undefined` when the input does not reveal it
 */
export const detectPreimage = (
  vin: number,
  claimTransaction: Transaction | { ins: BitcoinJsStyleInput[] },
  preimageHash: Uint8Array,
): Uint8Array | undefined => {
  let input: BitcoinJsStyleInput;

  if (claimTransaction instanceof Transaction) {
    const txInput = claimTransaction.getInput(vin);
    input = {
      script: txInput.finalScriptSig,
      witness: txInput.finalScriptWitness,
    };
  } else {
    input = claimTransaction.ins[vin];
  }

  const isPreimage = (candidate: Uint8Array): boolean =>
    candidate.length === 32 && equalBytes(sha256(candidate), preimageHash);

  // P2TR, P2WSH and nested P2SH-P2WSH reveal the preimage as a witness element
  const witnessPreimage = input.witness?.find(isPreimage);
  if (witnessPreimage !== undefined) {
    return witnessPreimage;
  }

  // Legacy P2SH reveals the preimage as a data push in the input script
  if (input.script !== undefined) {
    return Script.decode(input.script).find(
      (element): element is Uint8Array =>
        element instanceof Uint8Array && isPreimage(element),
    );
  }

  return undefined;
};
