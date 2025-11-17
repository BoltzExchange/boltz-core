import ops from '@boltz/bitcoin-ops';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import {
  Blinder,
  Creator,
  CreatorInput,
  CreatorOutput,
  Extractor,
  Finalizer,
  Pset,
  Signer,
  Transaction,
  Updater,
  ZKPGenerator,
  ZKPValidator,
  crypto,
  script,
  witnessStackToScriptWitness,
} from 'liquidjs-lib';
import { reverseBuffer, varuint } from 'liquidjs-lib/src/bufferutils';
import type { Network } from 'liquidjs-lib/src/networks';
import { getHexString } from '../../Utils';
import { OutputType } from '../../consts/Enums';
import { isRelevantTaprootOutput, validateInputs } from '../../swap/Claim';
import { scriptBuffersToScript } from '../../swap/SwapUtils';
import { getOutputValue } from '../Utils';
import Networks from '../consts/Networks';
import type { LiquidClaimDetails } from '../consts/Types';
import { ecpair, secp } from '../init';
import { createControlBlock, tapLeafHash, toHashTree } from './TaprootUtils';

const dummyTaprootSignature = Buffer.alloc(64);

const getSighashType = (type: OutputType) =>
  type === OutputType.Taproot
    ? Transaction.SIGHASH_DEFAULT
    : Transaction.SIGHASH_ALL;

const validateLiquidInputs = (
  utxos: LiquidClaimDetails[],
  isRefund: boolean,
) => {
  validateInputs(utxos);

  const taprootInputs = utxos.filter(isRelevantTaprootOutput);

  if (isRefund && taprootInputs.some((utxo) => utxo.keys === undefined)) {
    throw 'not all Taproot refund inputs have keys';
  }

  if (
    taprootInputs.some(
      (utxo) =>
        utxo.keys === undefined &&
        utxo.swapTree!.covenantClaimLeaf === undefined,
    )
  ) {
    throw 'not all Taproot signature claims have keys';
  }
};

/**
 * Claim swaps
 *
 * @param utxos UTXOs that should be claimed or refunded
 * @param destinationScript the output script to which the funds should be sent
 * @param fee how many satoshis should be paid as fee
 * @param isRbf whether the transaction should signal full Replace-by-Fee
 * @param network network of the transaction
 * @param blindingKey blinding public key for the output; undefined if the output should not be blinded
 * @param timeoutBlockHeight locktime of the transaction; only needed if the transaction is a refund
 * @param isRefund whether the transaction is a refund or claim
 */
export const constructClaimTransaction = (
  utxos: LiquidClaimDetails[],
  destinationScript: Buffer,
  fee: number,
  isRbf = true,
  network: Network = Networks.liquidMainnet,
  blindingKey?: Buffer,
  timeoutBlockHeight?: number,
  isRefund = false,
): Transaction => {
  validateLiquidInputs(utxos, isRefund);

  if (
    utxos.some(
      (utxo) =>
        (utxo.blindingPrivateKey === undefined) !==
        (utxos[0].blindingPrivateKey === undefined),
    )
  ) {
    throw 'all or none inputs have to be blinded';
  }

  if (
    utxos.some(
      (utxo) =>
        utxo.type !== OutputType.Taproot && utxo.type !== OutputType.Bech32,
    )
  ) {
    throw 'only Taproot or native SegWit inputs supported';
  }

  const pset = Creator.newPset();
  const updater = new Updater(pset);

  let utxoValueSum = BigInt(0);

  for (const [i, utxo] of utxos.entries()) {
    utxoValueSum += BigInt(getOutputValue(utxo));

    const txHash = Buffer.alloc(utxo.txHash.length);
    utxo.txHash.copy(txHash);
    const txid = getHexString(reverseBuffer(txHash));

    pset.addInput(
      new CreatorInput(
        txid,
        utxo.vout,
        isRbf ? 0xfffffffd : 0xffffffff,
        i == 0 ? timeoutBlockHeight : undefined,
      ).toPartialInput(),
    );
    updater.addInSighashType(i, getSighashType(utxo.type));

    if (utxo.type === OutputType.Legacy) {
      updater.addInNonWitnessUtxo(i, utxo.legacyTx!);
      updater.addInRedeemScript(i, utxo.redeemScript!);
    } else if (utxo.type === OutputType.Compatibility) {
      updater.addInNonWitnessUtxo(i, utxo.legacyTx!);
      updater.addInRedeemScript(
        i,
        scriptBuffersToScript([
          scriptBuffersToScript([
            getHexString(varuint.encode(ops.OP_0)),
            crypto.sha256(utxo.redeemScript!),
          ]),
        ]),
      );
    }

    if (utxo.type !== OutputType.Legacy) {
      updater.addInWitnessUtxo(i, utxo);
      updater.addInWitnessScript(i, utxo.redeemScript!);
    }
  }

  updater.addOutputs([
    {
      script: destinationScript,
      blindingPublicKey: blindingKey,
      asset: network.assetHash,
      amount: Number(utxoValueSum - BigInt(fee)),
      blinderIndex: blindingKey !== undefined ? 0 : undefined,
    },
  ]);

  const addFeeOutput = (isUnblinded = false) => {
    updater.addOutputs([
      {
        amount: isUnblinded ? fee - 1 : fee,
        asset: network.assetHash,
      },
    ]);
  };

  if (utxos[0].blindingPrivateKey !== undefined) {
    // We have to have at least one blinded output if we are spending blinded coins,
    // so we add a small OP_RETURN
    if (blindingKey === undefined) {
      pset.addOutput(
        new CreatorOutput(
          network.assetHash,
          // TODO: figure out flakiness with blinding 0 amount outputs
          1,
          Buffer.of(ops.OP_RETURN),
          Buffer.from(ecpair.makeRandom().publicKey),
          0,
        ).toPartialOutput(),
      );
    }

    addFeeOutput(blindingKey === undefined);
  } else {
    addFeeOutput();
  }

  if (utxos[0].blindingPrivateKey !== undefined || blindingKey !== undefined) {
    blindPset(pset, utxos);
  }

  const signer = new Signer(pset);

  const signatures: Buffer[] = [];

  for (const [i, utxo] of utxos.entries()) {
    if (utxo.type === OutputType.Taproot) {
      if (utxo.cooperative || utxo.keys === undefined) {
        signatures.push(dummyTaprootSignature);
        continue;
      }

      const leafHash = tapLeafHash(
        isRefund ? utxo.swapTree!.refundLeaf : utxo.swapTree!.claimLeaf,
      );
      const signature = utxo.keys!.signSchnorr(
        pset.getInputPreimage(
          i,
          getSighashType(utxo.type),
          network.genesisBlockHash,
          leafHash,
        ),
      );
      signatures.push(Buffer.from(signature));
      signer.addSignature(
        i,
        {
          genesisBlockHash: network.genesisBlockHash,
          tapScriptSigs: [
            {
              signature: Buffer.from(signature),
              pubkey: toXOnly(Buffer.from(utxo.keys!.publicKey)),
              leafHash,
            },
          ],
        },
        Pset.SchnorrSigValidator(secp.ecc),
      );
    } else {
      const signature = script.signature.encode(
        Buffer.from(
          utxo.keys!.sign(
            Buffer.from(pset.getInputPreimage(i, getSighashType(utxo.type))),
          ),
        ),
        getSighashType(utxo.type),
      );
      signatures.push(signature);

      signer.addSignature(
        i,
        {
          partialSig: {
            pubkey: Buffer.from(utxo.keys!.publicKey),
            signature,
          },
        },
        Pset.ECDSASigValidator(secp.ecc),
      );
    }
  }

  const finalizer = new Finalizer(pset);

  for (const [i, utxo] of utxos.entries()) {
    finalizer.finalizeInput(i, () => {
      const finals: {
        finalScriptSig?: Buffer;
        finalScriptWitness?: Buffer;
      } = {};

      if (utxo.type === OutputType.Legacy) {
        finals.finalScriptSig = scriptBuffersToScript([
          signatures[i],
          utxo.preimage,
          ops.OP_PUSHDATA1,
          utxo.redeemScript!,
        ]);
      } else if (utxo.type === OutputType.Compatibility) {
        finals.finalScriptSig = scriptBuffersToScript([
          scriptBuffersToScript([
            getHexString(varuint.encode(ops.OP_0)),
            crypto.sha256(utxo.redeemScript!),
          ]),
        ]);
      }

      if (utxo.type === OutputType.Taproot) {
        if (utxo.cooperative) {
          // Add a dummy to allow for extraction and an accurate fee estimation
          finals.finalScriptWitness = witnessStackToScriptWitness([
            dummyTaprootSignature,
          ]);
        } else {
          const isCovenantClaim = utxo.keys === undefined;

          const tapleaf = isRefund
            ? utxo.swapTree!.refundLeaf
            : isCovenantClaim
              ? utxo.swapTree!.covenantClaimLeaf!
              : utxo.swapTree!.claimLeaf;

          const witness = isRefund
            ? [signatures[i]]
            : isCovenantClaim
              ? [utxo.preimage]
              : [signatures[i], utxo.preimage];

          finals.finalScriptWitness = witnessStackToScriptWitness(
            witness.concat([
              tapleaf.output,
              createControlBlock(
                toHashTree(utxo.swapTree!.tree),
                tapleaf,
                utxo.internalKey!,
              ),
            ]),
          );
        }
      } else if (utxo.type !== OutputType.Legacy) {
        finals.finalScriptWitness = witnessStackToScriptWitness([
          signatures[i],
          utxo.preimage,
          utxo.redeemScript!,
        ]);
      }

      return finals;
    });
  }

  return Extractor.extract(pset);
};

const blindPset = (pset: Pset, utxos: LiquidClaimDetails[]) => {
  const zkpGenerator = new ZKPGenerator(
    secp as any,
    ZKPGenerator.WithBlindingKeysOfInputs(
      utxos.map((utxo) => utxo.blindingPrivateKey!),
    ),
  );
  const zkpValidator = new ZKPValidator(secp as any);
  const outputBlindingArgs = zkpGenerator.blindOutputs(
    pset,
    Pset.ECCKeysGenerator(secp.ecc),
  );

  const blinder = new Blinder(
    pset,
    zkpGenerator.unblindInputs(pset),
    zkpValidator,
    zkpGenerator,
  );

  blinder.blindLast({ outputBlindingArgs });
};
