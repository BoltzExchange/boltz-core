// tslint:disable:max-line-length
import { expect } from 'chai';
import { fromBase58 } from 'bip32';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import { constructRefundTransaction } from '../../../lib/swap/Refund';

// TODO: use valid values
describe('Refund', () => {
  const refundKeys = fromBase58('xprv9xgxR6htMdXUXGipynZp1janNrWNYJxaz2o4tH9fdtZqcF26BX5VB88GSM5KgZHWCyAyb8FZpQik2UET84CHfGWXFMG5zWWjmtDMgqYuo19');
  const redeemScript = getHexBuffer('a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac');
  const destinationScript = getHexBuffer('00140000000000000000000000000000000000000000');

  const utxo = {
    txHash: getHexBuffer('285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754'),
    vout: 0,
    value: 2000,
  };

  const timeoutBlockHeight = 11;
  const feePerByte = 1;
  const isRbf = false;

  it('should refund a P2WSH swap', () => {
    const testData = {
      args: {
        utxos: [{
          ...utxo,
          redeemScript,
          keys: refundKeys,
          type: OutputType.Bech32,
          script: getHexBuffer('00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e'),
        }],
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d7540000000000ffffffff015107000000000000160014000000000000000000000000000000000000000003483045022100ae80f03edf06c38b737514e6d172931be3cd6119abcb83c2c4364cb418dc64e802204e05fd017af60121fc51446a8075d3cca51833f5ecef365026e784a2d394883d010064a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0b000000',
    };

    const result = constructRefundTransaction(
      testData.args.utxos,
      destinationScript,
      timeoutBlockHeight,
      feePerByte,
      isRbf,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should refund a P2SH swap', () => {
    const testData = {
      args: {
        utxos: [{
          ...utxo,
          redeemScript,
          keys: refundKeys,
          type: OutputType.Legacy,
          script: getHexBuffer('a9148f439aff651860bdb28c66500c6e958cfbe7a69387'),
        }],
      },
      result: '0100000001285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000b0483045022100faa7d69ddb0b2eafcaac710e0732d3a719695bca8da5e6c53f9b6044c5eab7170220728456bd7ee5b5c42a56c716ffcd11828e54d65ce77bb841f06027bdd5f3fdbf01004c64a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368acffffffff01ce0600000000000016001400000000000000000000000000000000000000000b000000',
    };

    const result = constructRefundTransaction(
      testData.args.utxos,
      destinationScript,
      timeoutBlockHeight,
      feePerByte,
      isRbf,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });

  it('should refund a P2SH nested P2WSH swap', () => {
    const testData = {
      args: {
        utxos: [{
          ...utxo,
          redeemScript,
          keys: refundKeys,
          type: OutputType.Compatibility,
          script: getHexBuffer('a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87'),
        }],
      },
      result: '01000000000101285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d75400000000232200206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9effffffff012e07000000000000160014000000000000000000000000000000000000000003483045022100a6265c74c3744df470d07e9c240cfcc9d91d0d4241c25675c5f4f008221882f10220380b19f1586617a3aa4f73ebc7303be828f5b29914289634186f54205d996585010064a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac0b000000',
    };

    const result = constructRefundTransaction(
      testData.args.utxos,
      destinationScript,
      timeoutBlockHeight,
      feePerByte,
      isRbf,
    );

    expect(result.toHex()).to.be.equal(testData.result);
  });
});
