import { networks } from 'liquidjs-lib';
import type { Network } from 'liquidjs-lib/src/networks.js';

const Networks: {
  liquidMainnet: Network;
  liquidTestnet: Network;
  liquidRegtest: Network;
} = {
  liquidMainnet: networks.liquid,
  liquidTestnet: networks.testnet,
  liquidRegtest: networks.regtest,
};

export default Networks;
