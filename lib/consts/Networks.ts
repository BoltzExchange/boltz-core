import { NETWORK, TEST_NETWORK } from '@scure/btc-signer/utils.js';

export default {
  bitcoin: NETWORK,
  testnet: TEST_NETWORK,
  regtest: { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
} as const;
