import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { Script, SigHash, Transaction } from '@scure/btc-signer';
import { signECDSA, signSchnorr } from '@scure/btc-signer/utils.js';
import { OutputType } from '../Boltz';
import type { ClaimDetails } from '../consts/Types';
import { createControlBlock, taprootHashTree } from './TaprootUtils';

const LEGACY_SIGHASH = SigHash.ALL;
const DUMMY_TAPROOT_SIGNATURE = new Uint8Array(64);

export const isRelevantTaprootOutput = (
  utxo: Pick<ClaimDetails, 'type' | 'cooperative'>,
) => utxo.type === OutputType.Taproot && utxo.cooperative !== true;

export const validateInputs = (
  utxos: Pick<
    ClaimDetails,
    'type' | 'redeemScript' | 'swapTree' | 'internalKey'
  >[],
) => {
  if (
    utxos
      .filter((utxo) => utxo.type !== OutputType.Taproot)
      .some((utxo) => utxo.redeemScript === undefined)
  ) {
    throw Error('not all non Taproot inputs have a redeem script');
  }

  const relevantTaprootOutputs = utxos.filter(isRelevantTaprootOutput);

  if (relevantTaprootOutputs.some((utxo) => utxo.swapTree === undefined)) {
    throw Error('not all Taproot inputs have a swap tree');
  }

  if (relevantTaprootOutputs.some((utxo) => utxo.internalKey === undefined)) {
    throw Error('not all Taproot inputs have an internal key');
  }
};

export const constructClaimTransaction = (
  utxos: ClaimDetails[],
  destinationScript: Uint8Array,
  fee: bigint,
  isRbf = true,
  timeoutBlockHeight?: number,
  isRefund = false,
) => {
  validateInputs(utxos);

  const tx = new Transaction({
    version: 2,
    lockTime: timeoutBlockHeight,
  });

  const inputSum = utxos.reduce((acc, utxo) => acc + utxo.amount, BigInt(0));

  tx.addOutput({
    amount: inputSum - fee,
    script: destinationScript,
  });

  for (const utxo of utxos) {
    tx.addInput({
      txid: utxo.transactionId,
      index: utxo.vout,
      sequence: isRbf ? 0xfffffffd : 0xffffffff,
    });
  }

  for (const [index, utxo] of utxos.entries()) {
    switch (utxo.type) {
      case OutputType.Legacy: {
        // biome-ignore lint/complexity/useLiteralKeys: only way to get the hash to sign for the legacy input
        const hash = tx['preimageLegacy'](
          index,
          utxo.redeemScript,
          LEGACY_SIGHASH,
        );
        tx.updateInput(index, {
          finalScriptSig: Script.encode([
            signLegacy(hash, utxo.privateKey),
            utxo.preimage,
            utxo.redeemScript,
          ]),
        });
        break;
      }
      case OutputType.Compatibility: {
        tx.updateInput(index, {
          finalScriptSig: Script.encode([
            Script.encode(['OP_0', sha256(utxo.redeemScript)]),
          ]),
        });
        break;
      }
    }

    // Construct and sign the witness for (nested) SegWit inputs
    // When the Taproot output is spent cooperatively, we leave it empty
    if (utxo.type === OutputType.Taproot) {
      if (utxo.cooperative === true) {
        tx.updateInput(index, {
          finalScriptWitness: [DUMMY_TAPROOT_SIGNATURE],
        });

        continue;
      }

      if (utxo.swapTree === undefined || utxo.internalKey === undefined) {
        throw Error('swap tree or internal key is undefined');
      }

      const tapLeaf = isRefund
        ? utxo.swapTree.refundLeaf
        : utxo.swapTree.claimLeaf;

      const sigHash = tx.preimageWitnessV1(
        index,
        utxos.map((out) => out.script),
        SigHash.DEFAULT,
        utxos.map((out) => out.amount),
        undefined,
        tapLeaf.output,
        tapLeaf.version,
      );
      const signature = signSchnorr(sigHash, utxo.privateKey);
      const witness = [signature];

      if (!isRefund) {
        witness.push(utxo.preimage);
      }

      witness.push(tapLeaf.output);
      witness.push(
        createControlBlock(
          taprootHashTree(utxo.swapTree.tree),
          tapLeaf,
          utxo.internalKey,
        ),
      );

      tx.updateInput(index, {
        finalScriptWitness: witness,
      });
    } else if (
      utxo.type === OutputType.Bech32 ||
      utxo.type === OutputType.Compatibility
    ) {
      const sigHash = tx.preimageWitnessV0(
        index,
        utxo.redeemScript,
        LEGACY_SIGHASH,
        utxo.amount,
      );
      tx.updateInput(index, {
        finalScriptWitness: [
          signLegacy(sigHash, utxo.privateKey),
          utxo.preimage,
          utxo.redeemScript,
        ],
      });
    }
  }

  return tx;
};

export const signLegacy = (hash: Uint8Array, privateKey: Uint8Array) => {
  return concatBytes(
    signECDSA(hash, privateKey, true),
    new Uint8Array([LEGACY_SIGHASH]),
  );
};
