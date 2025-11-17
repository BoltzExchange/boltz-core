import ops from '@boltz/bitcoin-ops';
import { crypto, script } from 'bitcoinjs-lib';
import { reverseBuffer } from 'liquidjs-lib/src/bufferutils';
import { getHexBuffer } from '../../Utils';
import type { LiquidSwapTree, Tapleaf } from '../../consts/Types';
import bitcoinReverseSwapTree from '../../swap/ReverseSwapTree';
import { leafVersionLiquid } from '../../swap/TaprootUtils';
import { assignTreeProbabilities, sortTree } from '../../swap/TreeSort';
import { getScriptIntrospectionValues } from '../Utils';
import liquidOps from '../consts/Ops';

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
  preimageHash: Buffer,
  assetHash: string,
  outputScript: Buffer,
  expectedAmount: number,
): Tapleaf => {
  const userOutput = getScriptIntrospectionValues(outputScript);

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUint64LE(BigInt(expectedAmount));

  return {
    version: leafVersionLiquid,
    output: script.compile([
      ops.OP_SIZE,
      script.number.encode(32),
      ops.OP_EQUALVERIFY,
      ops.OP_HASH160,
      crypto.ripemd160(preimageHash),
      ops.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      liquidOps.OP_INSPECTOUTPUTSCRIPTPUBKEY,
      script.number.encode(userOutput.version),
      ops.OP_EQUALVERIFY,
      userOutput.script,
      ops.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      liquidOps.OP_INSPECTOUTPUTASSET,
      ops.OP_1,
      ops.OP_EQUALVERIFY,
      reverseBuffer(getHexBuffer(assetHash)),
      ops.OP_EQUALVERIFY,

      claimCovenantOutputIndex,
      liquidOps.OP_INSPECTOUTPUTVALUE,
      ops.OP_DROP,
      amountBuffer,
      ops.OP_EQUAL,
    ]),
  };
};

const reverseSwapTree = (
  preimageHash: Buffer,
  claimPublicKey: Buffer,
  refundPublicKey: Buffer,
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
    throw 'duplicate feature';
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
        throw `unknown feature: ${feature.type}`;
    }
  }

  return {
    ...tree,
    tree: sortTree<Tapleaf>(assignTreeProbabilities(tree)),
  };
};

export default reverseSwapTree;
export { Feature, FeatureOption };
