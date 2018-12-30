// tslint:disable:max-line-length
import { expect } from 'chai';
import { fromBase58 } from 'bip32';
import { getHexBuffer } from '../../../lib/Utils';
import { constructRefundTransaction } from '../../../lib/swap/Refund';
import { OutputType } from '../../../lib/consts/Enums';

// TODO: use valid values
describe('Refund', () => {
  const timeoutBlockHeight = 11;
  const refundKeys = fromBase58('xprv9xgxR6htMdXUXGipynZp1janNrWNYJxaz2o4tH9fdtZqcF26BX5VB88GSM5KgZHWCyAyb8FZpQik2UET84CHfGWXFMG5zWWjmtDMgqYuo19');
  const redeemScript = getHexBuffer('a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac');
  const destinationScript = getHexBuffer('00140000000000000000000000000000000000000000');

  const utxo = {
    txHash: getHexBuffer('285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754'),
    vout: 0,
    value: 2000,
  };

  it('should refund a P2WSH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Bech32,
          script: getHexBuffer('00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e'),
        },
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754000000000000000000015107000000000000160014000000000000000000000000000000000000000003483045022100e5bdb5234b60d9c738cf1d5749246705784ddda852a187bc7d6048c54c16964802203b8d44e4e51d939b2ff8da04847ee708b638bb43ba966d6f830c6c195b20704f010064a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0b000000',
    };

    const result = constructRefundTransaction(
      refundKeys,
      redeemScript,
      timeoutBlockHeight,
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should refund a P2SH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Legacy,
          script: getHexBuffer('a9148f439aff651860bdb28c66500c6e958cfbe7a69387'),
        },
      },
      result: '0100000001285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000af4730440220428ff2f38dc6245357557e811302a869414e296d8a987c07a9d5f5c79fc2009f02207e59844831a0a158f2603d33a989bdd593358b4c012db2ff1e2bc5b08b299eb101004c64a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0000000001ce0600000000000016001400000000000000000000000000000000000000000b000000',
    };

    const result = constructRefundTransaction(
      refundKeys,
      redeemScript,
      timeoutBlockHeight,
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should refund a P2SH nested P2WSH swap', () => {
    const testData = {
      args: {
        utxo: {
          ...utxo,
          type: OutputType.Compatibility,
          script: getHexBuffer('a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87'),
        },
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000232200206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e00000000012e070000000000001600140000000000000000000000000000000000000000034730440220333379115c34abbe1a6462e0363aeb205ff0a636e03d3b8f892b7259da02f338022043d40872e65fa0520f2e947ba42ad58d1c94af04451943654f35058aae708e3c010064a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0b000000',
    };

    const result = constructRefundTransaction(
      refundKeys,
      redeemScript,
      timeoutBlockHeight,
      testData.args.utxo,
      destinationScript,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });
});
