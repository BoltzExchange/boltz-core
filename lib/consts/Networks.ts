import type { BTC_NETWORK } from '@scure/btc-signer/utils.js';
import { NETWORK, TEST_NETWORK } from '@scure/btc-signer/utils.js';

const Networks: {
  bitcoin: BTC_NETWORK;
  testnet: BTC_NETWORK;
  regtest: BTC_NETWORK;
} = {
  bitcoin: NETWORK,
  testnet: TEST_NETWORK,
  regtest: { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
};

export default Networks;
