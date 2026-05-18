import * as Boltz from '../../lib/Boltz.ts';

describe('Boltz main entry', () => {
  test('should export the public API surface', () => {
    expect(Boltz.Musig).toBeDefined();
    expect(Boltz.Networks).toBeDefined();
    expect(Boltz.OutputType).toBeDefined();
    expect(Boltz.Scripts).toBeDefined();
    expect(Boltz.SwapTreeSerializer).toBeDefined();
    expect(Boltz.TaprootUtils).toBeDefined();
    expect(Boltz.Types).toBeDefined();

    expect(typeof Boltz.compareTrees).toBe('function');
    expect(typeof Boltz.constructClaimTransaction).toBe('function');
    expect(typeof Boltz.constructRefundTransaction).toBe('function');
    expect(typeof Boltz.detectPreimage).toBe('function');
    expect(typeof Boltz.detectSwap).toBe('function');
    expect(typeof Boltz.extractClaimPublicKeyFromReverseSwapTree).toBe(
      'function',
    );
    expect(typeof Boltz.extractClaimPublicKeyFromSwapTree).toBe('function');
    expect(typeof Boltz.extractRefundPublicKeyFromReverseSwapTree).toBe(
      'function',
    );
    expect(typeof Boltz.extractRefundPublicKeyFromSwapTree).toBe('function');
    expect(typeof Boltz.fundingAddressTree).toBe('function');
    expect(typeof Boltz.reverseSwapScript).toBe('function');
    expect(typeof Boltz.reverseSwapTree).toBe('function');
    expect(typeof Boltz.swapScript).toBe('function');
    expect(typeof Boltz.swapTree).toBe('function');
    expect(typeof Boltz.targetFee).toBe('function');
  });

  test('should not depend on optional peer dependencies', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('liquidjs-lib', () => {
        throw new Error('main entry must not import liquidjs-lib');
      });
      jest.doMock('@vulpemventures/secp256k1-zkp', () => {
        throw new Error(
          'main entry must not import @vulpemventures/secp256k1-zkp',
        );
      });

      await expect(import('../../lib/Boltz.ts')).resolves.toBeDefined();
    });
  });
});
