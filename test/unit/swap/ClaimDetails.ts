import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { getHexBuffer } from '../../../lib/Utils';
import { OutputType } from '../../../lib/consts/Enums';
import type { ClaimDetails } from '../../../lib/consts/Types';

const bip32 = BIP32Factory(ecc);

const utxo = {
  txHash: getHexBuffer(
    '285d227e2823c679c224b4d562a9b5b5b7b927badd483df9f4225c6fc761d754',
  ),
  vout: 0,
  value: 2000,

  preimage: getHexBuffer('b5b2dbb1f0663878ecbc20323b58b92c'),
  keys: bip32.fromBase58(
    'xprv9xgxR6htMdXUXGipynZp1janNrWNYJxaz2o4tH9fdtZqcF26BX5VB88GSM5KgZHWCyAyb8FZpQik2UET84CHfGWXFMG5zWWjmtDMgqYuo19',
  ),
  redeemScript: getHexBuffer(
    'a914a0738c92fde6361f09d28950c7bd0d2bf32b34be87632103be4a251dae719d565ce1d6a7a5787df99fc1ecc1f6e847567981a686f32abce167027802b1752103f7877d4ae985bb30b6f150ad6b6b9935c342432beed1a4781347b169c1e2417368ac',
  ),
};

export const claimDetails = [
  {
    ...utxo,
    type: OutputType.Bech32,
    script: getHexBuffer(
      '00206f38b6ce82427d4df080a9833d06cc6c66ab816545c9fd4df50f9d1ca8430b9e',
    ),
  },
  {
    ...utxo,
    type: OutputType.Legacy,
    script: getHexBuffer('a9148f439aff651860bdb28c66500c6e958cfbe7a69387'),
  },
  {
    ...utxo,
    type: OutputType.Compatibility,
    script: getHexBuffer('a9143cdeb56e328a10d3bfe107fd5a16bd73871adb8d87'),
  },
];

export const claimDetailsMap = new Map<OutputType, ClaimDetails>(
  claimDetails.map((entry) => [entry.type, entry]),
);
