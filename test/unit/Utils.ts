import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { SLIP77Factory } from 'slip77';

export const slip77 = (zkp: Secp256k1ZKP) =>
  SLIP77Factory(zkp.ecc).fromSeed(
    Buffer.from(
      '46c599214112ab07572995a45b83c3bd5be58ed9bd602126a10090ce61901ce4',
      'hex',
    ),
  );
