import zkp from '@vulpemventures/secp256k1-zkp';
import { Transaction, address } from 'liquidjs-lib';
import { getHexBuffer } from '../../../lib/Utils';
import { getOutputValue, init } from '../../../lib/liquid';
import { elementsClient } from '../Utils';

describe('Liquid Utils', () => {
  beforeAll(async () => {
    const [, secp] = await Promise.all([elementsClient.init(), zkp()]);
    init(secp);
  });

  afterAll(async () => {
    await elementsClient.generate(1);
  });

  test('should decode unconfidential outputs', async () => {
    const { scriptPubKey, unconfidentialAddress } = address.fromConfidential(
      await elementsClient.getNewAddress(),
    );

    const amount = 341_125;
    const tx = Transaction.fromHex(
      await elementsClient.getRawTransaction(
        await elementsClient.sendToAddress(unconfidentialAddress, amount),
      ),
    );

    expect(
      getOutputValue(tx.outs.find((out) => out.script.equals(scriptPubKey!))!),
    ).toEqual(amount);
  });

  test('should decode unconfidential outputs when a blinding key is provided', async () => {
    const addr = await elementsClient.getNewAddress();
    const { scriptPubKey, unconfidentialAddress } =
      address.fromConfidential(addr);

    const blindingKey = getHexBuffer(
      await elementsClient.dumpBlindingKey(addr),
    );

    const amount = 123_321;
    const tx = Transaction.fromHex(
      await elementsClient.getRawTransaction(
        await elementsClient.sendToAddress(unconfidentialAddress, amount),
      ),
    );

    expect(
      getOutputValue({
        ...tx.outs.find((out) => out.script.equals(scriptPubKey!))!,
        blindingPrivateKey: blindingKey,
      }),
    ).toEqual(amount);
  });

  test('should decode confidential outputs', async () => {
    const addr = await elementsClient.getNewAddress();
    expect(addr.startsWith('el1')).toBeTruthy();

    const { scriptPubKey } = address.fromConfidential(addr);
    const blindingKey = getHexBuffer(
      await elementsClient.dumpBlindingKey(addr),
    );

    const amount = 121_429;
    const tx = Transaction.fromHex(
      await elementsClient.getRawTransaction(
        await elementsClient.sendToAddress(addr, amount),
      ),
    );

    expect(
      getOutputValue({
        ...tx.outs.find((out) => out.script.equals(scriptPubKey!))!,
        blindingPrivateKey: blindingKey,
      }),
    ).toEqual(amount);
  });
});
