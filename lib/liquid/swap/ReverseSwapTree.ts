import { ripemd160 } from '@noble/hashes/legacy.js';
import { hex } from '@scure/base';
import { opcodes, script } from 'liquidjs-lib';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils.js';
import type { LiquidSwapTree, TapLeaf } from '../../consts/Types.ts';
import bitcoinReverseSwapTree from '../../swap/ReverseSwapTree.ts';
import { TAP_LEAF_VERSION_LIQUID } from '../../swap/TaprootUtils.ts';
import { assignTreeProbabilities, sortTree } from '../../swap/TreeSort.ts';
import { getScriptIntrospectionValues } from '../Utils.ts';

enum Feature {
  ClaimCovenant,
}

type ClaimCovenant = {
  assetHash: string;
  outputScript: Buffer;
  expectedAmount: number;
};

type FeatureOption = { type: Feature } & ClaimCovenant;

const claimCovenantOutputIndex = script.number.encode(0);

const createClaimCovenantLeaf = (
  preimageHash: Uint8Array,
  assetHash: string,
  outputScript: Buffer,
  expectedAmount: number,
): TapLeaf => {
  const userOutput = getScriptIntrospectionValues(outputScript);

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUint64LE(BigInt(expectedAmount));

  return {
    version: TAP_LEAF_VERSION_LIQUID,
    output: script.compile([
      opcodes.OP_SIZE,
      script.number.encode(32),
      opcodes.OP_EQUALVERIFY,
      opcodes.OP_HASH160,
      Buffer.from(ripemd160(preimageHash)),
      opcodes.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      opcodes.OP_INSPECTOUTPUTSCRIPTPUBKEY,
      script.number.encode(userOutput.version),
      opcodes.OP_EQUALVERIFY,
      userOutput.script,
      opcodes.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      opcodes.OP_INSPECTOUTPUTASSET,
      opcodes.OP_1,
      opcodes.OP_EQUALVERIFY,
      reverseBuffer(Buffer.from(hex.decode(assetHash))),
      opcodes.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      opcodes.OP_INSPECTOUTPUTVALUE,
      opcodes.OP_DROP,
      amountBuffer,
      opcodes.OP_EQUAL,
    ]),
  };
};

const reverseSwapTree = (
  preimageHash: Uint8Array,
  claimPublicKey: Uint8Array,
  refundPublicKey: Uint8Array,
  timeoutBlockHeight: number,
  features?: FeatureOption[],
): LiquidSwapTree => {
  const tree: LiquidSwapTree = bitcoinReverseSwapTree(
    true,
    preimageHash,
    claimPublicKey,
    refundPublicKey,
    timeoutBlockHeight,
  );

  if (features === undefined) {
    return tree;
  }

  if (
    new Set(features.map((feature) => feature.type)).size !== features.length
  ) {
    throw new Error('duplicate feature');
  }

  for (const feature of features) {
    switch (feature.type) {
      case Feature.ClaimCovenant:
        tree.covenantClaimLeaf = createClaimCovenantLeaf(
          preimageHash,
          feature.assetHash,
          feature.outputScript,
          feature.expectedAmount,
        );
        break;

      default:
        throw new Error(`unknown feature: ${feature.type}`);
    }
  }

  return {
    ...tree,
    tree: sortTree<TapLeaf>(assignTreeProbabilities(tree)),
  };
};

export default reverseSwapTree;
export { Feature };
export type { FeatureOption };
