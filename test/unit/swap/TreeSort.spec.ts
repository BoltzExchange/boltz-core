import type { LiquidSwapTree } from '../../../lib/consts/Types';
import { createLeaf } from '../../../lib/swap/TaprootUtils';
import { assignTreeProbabilities, sortTree } from '../../../lib/swap/TreeSort';

describe('TreeSort', () => {
  test.each`
    tree                                             | result
    ${[[100, 1]]}                                    | ${1}
    ${[[51, 1], [49, 2]]}                            | ${[1, 2]}
    ${[[10, 1], [20, 2], [70, 3]]}                   | ${[3, [2, 1]]}
    ${[[10, 1], [20, 2], [30, 3], [40, 4]]}          | ${[[4, 3], [2, 1]]}
    ${[[10, 1], [20, 2], [30, 3], [40, 4]]}          | ${[[4, 3], [2, 1]]}
    ${[[5, 1], [5, 2], [10, 3], [25, 4], [50, 5]]}   | ${[5, [4, [3, [1, 2]]]]}
    ${[[12, 1], [12, 2], [12, 3], [12, 4], [50, 5]]} | ${[5, [[1, 2], [3, 4]]]}
  `('should sort generic tree', ({ tree, result }) => {
    expect(
      sortTree(
        (tree as [number, any][]).map(([probability, value]) => ({
          probability,
          value,
        })),
      ),
    ).toEqual(result);
  });

  test('should sort tree', () => {
    const tree: Omit<LiquidSwapTree, 'tree'> = {
      claimLeaf: createLeaf(true, [1]),
      refundLeaf: createLeaf(true, [2]),
    };
    const sortedTree = sortTree(assignTreeProbabilities(tree));

    expect(sortedTree).toHaveLength(2);
    expect(sortedTree[0]).toEqual(tree.claimLeaf);
    expect(sortedTree[1]).toEqual(tree.refundLeaf);
  });

  test('should sort tree with claim covenant', () => {
    const tree: Omit<LiquidSwapTree, 'tree'> = {
      claimLeaf: createLeaf(true, [1]),
      refundLeaf: createLeaf(true, [2]),
      covenantClaimLeaf: createLeaf(true, [3]),
    };
    const sortedTree = sortTree(assignTreeProbabilities(tree));

    expect(sortedTree).toHaveLength(2);
    expect(sortedTree[0]).toEqual(tree.covenantClaimLeaf);
    expect(sortedTree[1]).toHaveLength(2);
    expect(sortedTree[1][0]).toEqual(tree.claimLeaf);
    expect(sortedTree[1][1]).toEqual(tree.refundLeaf);
  });

  test('should assign tree probabilities', () => {
    const tree: Omit<LiquidSwapTree, 'tree'> = {
      claimLeaf: createLeaf(true, [1]),
      refundLeaf: createLeaf(true, [2]),
    };
    const probabilities = assignTreeProbabilities(tree);

    expect(probabilities).toHaveLength(2);
    expect(probabilities[0]).toEqual({
      probability: 51,
      value: tree.claimLeaf,
    });
    expect(probabilities[1]).toEqual({
      probability: 49,
      value: tree.refundLeaf,
    });
  });

  test('should assign tree probabilities with claim covenant', () => {
    const tree: Omit<LiquidSwapTree, 'tree'> = {
      claimLeaf: createLeaf(true, [1]),
      refundLeaf: createLeaf(true, [2]),
      covenantClaimLeaf: createLeaf(true, [3]),
    };
    const probabilities = assignTreeProbabilities(tree);

    expect(probabilities).toHaveLength(3);
    expect(probabilities[0]).toEqual({
      probability: 51,
      value: tree.covenantClaimLeaf,
    });
    expect(probabilities[1]).toEqual({
      probability: 25,
      value: tree.claimLeaf,
    });
    expect(probabilities[2]).toEqual({
      probability: 24,
      value: tree.refundLeaf,
    });
  });
});
