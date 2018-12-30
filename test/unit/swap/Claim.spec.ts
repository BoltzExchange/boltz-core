// tslint:disable:max-line-length
import { expect } from 'chai';
import { fromBase58 } from 'bip32';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import { constructClaimTransaction } from '../../../lib/swap/Claim';

// TODO: use valid values
describe('Claim', () => {
  const preimage = getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c');
  const keys = fromBase58('xprv9xgxR6htMdXUXGipynZp1janNrWNYJxaz2o4tH9fdtZqcF26BX5VB88GSM5KgZHWCyAyb8FZpQik2UET84CHfGWXFMG5zWWjmtDMgqYuo19');
  const redeemScript = getHexBuffer('a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac');
  const destinationScript = getHexBuffer('00140000000000000000000000000000000000000000');

  const utxo = {
    txHash: getHexBuffer('285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754'),
    vout: 0,
    value: 2000,
  };

  it('should claim a P2WSH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Bech32,
          script: getHexBuffer('00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e'),
        },
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754000000000000000000014d070000000000001600140000000000000000000000000000000000000000034830450221008fb449f3294795c0ad1f1ac53fa23425f422f8371f3e1588de0238e635f8a5dd02204bd38cd819fef883a4da74a91d9cc8b40c4ac521289e15bf26b3b7024055235e0110b5b2dbb1f0663878ecbc20323b58b92c64a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac00000000',
    };

    const result = constructClaimTransaction(
      {
        preimage,
        keys,
        redeemScript,
      },
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should claim a P2SH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Legacy,
          script: getHexBuffer('a9148f439aff651860bdb28c66500c6e958cfbe7a69387'),
        },
      },
      result: '0100000001285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000bf473044022070dd945efa8c86c5e1e8adcfe9790786bd3c5f24cf52adcf32c45b52c73ba274022074a08e41fa468c6b5aa8b27bae1877b518501f05d55898f4d2172206c62defcf0110b5b2dbb1f0663878ecbc20323b58b92c4c64a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0000000001be06000000000000160014000000000000000000000000000000000000000000000000',
    };

    const result = constructClaimTransaction(
      {
        preimage,
        keys,
        redeemScript,
      },
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should claim a P2SH nested P2WSH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Compatibility,
          script: getHexBuffer('a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87'),
        },
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000232200206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e00000000012a07000000000000160014000000000000000000000000000000000000000003473044022041b0ba8ec1c071d0873278fa44ad3b47a14d38e69f7993d0cf5b99b8b180c7e202207519122ff4f31059060eba9bfc51ce97c9bf35d8777f3464c4091de7eafd6c240110b5b2dbb1f0663878ecbc20323b58b92c64a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac00000000',
    };

    const result = constructClaimTransaction(
      {
        preimage,
        keys,
        redeemScript,
      },
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });
});
