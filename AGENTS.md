# Boltz Core integration guide

This guide defines integration requirements for any app (human- or
agent-written) using `boltz-core`.

- `boltz-core` is intentionally low-level (Taproot scripts, MuSig2,
  claim/refund builders, swap-tree serialization). Product UX, key storage,
  retries, and recovery workflows belong to the integrating app.
- `boltz-web-app` is the reference implementation:
  <https://github.com/BoltzExchange/boltz-web-app>. When this guide is
  ambiguous, match its behavior.
- For end users, the canonical rescue/refund UI is
  <https://boltz.exchange/rescue/external>. Link to it instead of
  re-implementing the full rescue state machine.

## Canonical Boltz references

If this guide conflicts with official docs, docs win (endpoint shapes, status
strings, fees, 0-conf, SDK support can drift):

- [Introduction](https://api.docs.boltz.exchange/)
- [Clients, SDKs & Libraries](https://api.docs.boltz.exchange/libraries.html)
- [Swap Types & States](https://api.docs.boltz.exchange/lifecycle.html)
- [Claims & Refunds](https://api.docs.boltz.exchange/claiming-swaps.html)
- [Swap Restore](https://api.docs.boltz.exchange/swap-restore.html)
- [Asset Rescue](https://api.docs.boltz.exchange/asset-rescue.html)
- [Common Mistakes](https://api.docs.boltz.exchange/common-mistakes.html)
- [0-conf](https://api.docs.boltz.exchange/0-conf.html)
- [Webhooks](https://api.docs.boltz.exchange/webhooks.html)
- [REST API v2](https://api.docs.boltz.exchange/api-v2.html)

## 1. Critical failure modes

Any one of these can permanently lock funds:

1. No swap-secret backup (random per-swap keys, no rescue file).
2. No claim implementation for UTXO Reverse/Chain swaps (swap seen as "done"
   after lockup, never claimed).
3. Cooperative MuSig2 only, without script-path fallback.
4. Rescue derivation incompatible with `boltz-web-app` / hosted rescue flow.

Cross-check before shipping:
[Common Mistakes](https://api.docs.boltz.exchange/common-mistakes.html).

Reference files in `boltz-web-app`:

- `src/utils/claim.ts` (cooperative + fallback claim flows)
- `src/utils/rescue.ts` (refund flow, asset rescue, rescue list)
- `src/utils/rescueFile.ts` (rescue file format/validation)
- `src/utils/rescueDerivation.ts` (derivation paths, preimage derivation)
- `src/utils/swapCreator.ts` (per-swap key + preimage generation)
- `src/utils/taproot/musig.ts` (`createMusig` / `tweakMusig`, key ordering)

## 2. Integration profiles

Status semantics: [Swap Types & States](https://api.docs.boltz.exchange/lifecycle.html).
Current 0-conf policy: [0-conf](https://api.docs.boltz.exchange/0-conf.html)
(changes over time; e.g. Bitcoin mainchain currently has no 0-conf).

### 2a. End-user frontends (wallets, dApps, mobile)

- **Claim responsibility:** For BTC/L-BTC Reverse and Chain swaps, your app
  must claim once lockup reaches `transaction.confirmed` (or
  `transaction.mempool` if user chose 0-conf and Boltz allows it for that
  asset). Boltz does not claim for users.
- Run the cooperative-then-fallback flow from status listeners and resume on
  app restart for any lockup that is visible but unclaimed (see
  `isSwapClaimable` / `createRescueList` pattern in `src/utils/rescue.ts`).
- Use one BIP39+BIP32 rescue key per user as the source of swap secrets.
  Create it on first use and require backup confirmation before creating swaps.
- Persist `claimPrivateKeyIndex` / `refundPrivateKeyIndex` (not raw private
  keys) when rescue derivation is enabled.
- Submit rescue `xpub` at swap creation so Boltz can correlate/restore swaps.
- Enforce backup gate: refuse Submarine and Chain swap creation until user
  confirms rescue backup (matches
  [PR #1269](https://github.com/BoltzExchange/boltz-web-app/pull/1269)).
- **Rescue UI:** Use <https://boltz.exchange/rescue/external> as the primary
  user flow (UTXO rescue via rescue file + EVM refunds via wallet connect).
- If custom rescue UI is unavoidable, keep rescue file/derivation byte-
  compatible with section 3 so hosted rescue remains a fallback.

### 2b. Backend services (automated/server-signed)

Boltz recommends non-custodial client-side integrations. If backend signing is
unavoidable (for your own funds), do not sign on other users' behalf.

- **Claim responsibility:** same as 2a. Without a claim worker, successful
  lockups become stuck outputs.
- Prefer rescue-key derivation for deterministic recovery across redeploys.
  Alternative: store per-swap keys in HSM/encrypted DB with lifetime >= swap
  timeout.
- Claim worker requirements:
  - Trigger from Webhooks/WS on lockup reaching `transaction.confirmed` (or
    `transaction.mempool` when 0-conf is allowed).
  - On restart, scan and resume all lockup-visible unclaimed swaps.
  - On cooperative path failure (timeout/network/Boltz error/invalid partial),
    auto-retry via script-path fallback; never drop claim attempts.
- Use `targetFee` (`lib/TargetFee.ts`) and refuse broadcasts where
  `inputSum - fee` is below expected receive amount.
- Treat rescue mnemonic as top-tier secret (encrypt at rest, strict access,
  never log).

## 3. Rescue derivation compatibility contract

Conceptual spec:
[Swap Restore](https://api.docs.boltz.exchange/swap-restore.html).

These values must match `boltz-web-app` and
<https://boltz.exchange/rescue/external> byte-for-byte, or hosted rescue and
support restore will fail.

### Rescue file format

JSON payload:
`{ "mnemonic": "<BIP39 12-word english mnemonic>" }`
validated with `@scure/bip39` English wordlist.

### Mnemonic -> HD key

```ts
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";

const hdKey = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));
```

### Derivation paths (non-hardened)

| Asset class | Path |
| --- | --- |
| BTC and L-BTC | `m/44/0/0/0/{index}` |
| EVM (RBTC, TBTC, USDT0, ...) | `m/44/{chainId}/0/0/{index}` |
| EVM gas abstraction | `m/44/{chainId}/1/0` |

- `{index}` is a monotonically increasing per-asset counter persisted per swap.
- Do **not** harden any segment (`'`), or derivation becomes incompatible.

### Preimage derivation (Reverse and Chain only)

```ts
import { sha256 } from "@noble/hashes/sha2.js";

const privateKey = hdKey.derive(`m/44/0/0/0/${index}`).privateKey!;
const preimage = sha256(privateKey);
```

Submarine swaps do not use this preimage path (Boltz provides preimage on
invoice settlement).

### Restore xpub

```ts
const xpub = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
  .publicExtendedKey;
```

Submit this at swap creation for server-side swap correlation/restore.

### Mistakes to flag

- Generating random per-swap private keys while rescue key exists.
- Using random preimages for Reverse/Chain swaps instead of
  `sha256(derivedPrivateKey)`.
- Hashing mnemonic/seed instead of derived per-swap key.
- Using hardened paths (e.g. `m/44'/0'/0'/0/{index}`).
- Using non-English wordlists or 24-word rescue phrases.
- Storing rescue file unencrypted.

## 4. Claim/refund contract (cooperative + fallback)

Conceptual spec:
[Claims & Refunds](https://api.docs.boltz.exchange/claiming-swaps.html).

Doc invariants:

- Boltz partial signatures use `SIGHASH_DEFAULT`.
- Boltz public key comes first in MuSig2 aggregation.
- Every Taproot claim/refund must attempt cooperative MuSig2 first and must
  have script-path fallback.

### Required flow

1. Need to claim or refund.
2. Build tx with `cooperative: true`.
3. Run MuSig2 session (`nonce -> aggregate -> partial -> aggregate`).
4. If Boltz partial signature succeeds, broadcast key-path tx.
5. If Boltz partial fails/times out/errors:
   - rebuild with `cooperative: false`
   - sign script-path leaf claim/refund
   - broadcast script-path tx

### API checklist

1. Build output script with `swapTree`, `reverseSwapTree`, or
   `fundingAddressTree` (`lib/liquid/swap/` for Liquid).
2. Aggregate with `Musig.create`; participant order: `[boltzPub, ourPub]`.
3. Tweak with `TaprootUtils.tweakMusig` (or Liquid equivalent) before signing.
4. Detect lockup vout via `detectSwap(tweaked.aggPubkey, tx)`.
5. Build tx with `constructClaimTransaction` / `constructRefundTransaction`;
   set `cooperative: true` for cooperative witness placeholder.
6. Compute sighash using `tx.preimageWitnessV1` (BTC) or
   `LiquidTaprootUtils.hashForWitnessV1` (Liquid).
7. Run typestate signing:

   ```ts
   const sig = tweaked
     .message(sigHash)
     .generateNonce()
     .aggregateNonces([[boltzPub, boltzNonce]])
     .initializeSession()
     .signPartial()
     .addPartial(boltzPub, boltzPartial)
     .aggregatePartials();

   setCooperativeWitness(tx, inputIndex, sig);
   ```

8. On any cooperative error: warn, rebuild with `cooperative: false`, and
   complete script-path spend (provide `swapTree`, `internalKey`, `privateKey`,
   plus `preimage` for claim).

### Multi-input refunds

Create and tweak a new MuSig key aggregation per input. Reusing one session
across inputs yields invalid signatures.

### Submarine claim variant

User does not broadcast own claim; they cosign Boltz's claim through
`GET`/`POST /swap/submarine/{id}/claim`, signing
`claimDetails.transactionHash`, then posting partial signature + pubnonce.
Reference: `createSubmarineSignature` in `src/utils/claim.ts`.

### Chain swap variant

Each side cosigns the other's claim through `GET`/`POST /swap/chain/{id}/claim`:
user posts partial for Boltz's lockup claim and requests Boltz partial for
user destination claim. References: `claimChainSwap`,
`createTheirPartialChainSwapSignature` in `src/utils/claim.ts`.

### Mistakes to flag

- Cooperative only, no fallback.
- Missing `cooperative: true` on intended cooperative path.
- Forgetting to clear cooperative mode during fallback.
- Wrong MuSig participant ordering (our key first).
- Reusing a MuSig session across multiple inputs.
- Using random Reverse/Chain preimages with rescue key enabled.
- Catching cooperative errors without retrying non-cooperative path.

## 5. Asset Rescue (Liquid only)

Conceptual spec:
[Asset Rescue](https://api.docs.boltz.exchange/asset-rescue.html).

Applies only to Liquid Taproot swaps where wrong (non-L-BTC) tokens were sent
to a lockup address, and status is `transaction.lockupFailed` or
`swap.expired`. Boltz cosigns and contributes L-BTC fees to rescue funds.

Endpoints:

- `POST /v2/asset/{currency}/rescue/setup`
- `POST /v2/asset/{currency}/rescue/broadcast`

Reference implementation: `assetRescueRefund` in `src/utils/rescue.ts`.

For correctly funded swaps and non-Liquid assets, recovery is section 4
(cooperative then fallback); no external asset-rescue endpoint exists.

## 6. Backup and rescue UX policy

Background:
[Swap Restore](https://api.docs.boltz.exchange/swap-restore.html),
[Claims & Refunds: Emergency Procedures](https://api.docs.boltz.exchange/claiming-swaps.html#emergency-procedures).

- Rescue file is mandatory for Submarine and Chain swaps; recommended for
  Reverse swaps.
- Legacy refund files (per-swap private keys + metadata) are backward-compat
  only; new code should derive from rescue mnemonic + persisted key index.
- Never store rescue data unencrypted on backend. Prompt client users to back
  up before swap creation.
- End-user rescue entrypoint is <https://boltz.exchange/rescue/external>
  (`Rescue swap`, `Refund stuck swap`, `Restore swaps`, etc).
- If custom rescue UI is unavoidable, keep section 3 compatibility so users can
  always fall back to hosted rescue.
- Last-resort awareness (not primary design path):
  - UTXO Submarine: lost rescue file but retained Lightning invoice -> invoice
    preimage can still claim funds; Boltz support can help:
    [Invoice Preimage](https://api.docs.boltz.exchange/claiming-swaps.html#invoice-preimage).
  - EVM: lost refund metadata -> lockup events indexed by `refundAddress`;
    hosted flow already scans these logs.

## 7. Quick API cheat sheet

Common `boltz-core` entry points:

- **MuSig2:** `Musig.create`, then
  `.message().generateNonce().aggregateNonces().initializeSession().signPartial().addPartial().aggregatePartials()`
- **Swap trees:** `swapTree`, `reverseSwapTree`, `fundingAddressTree`,
  `SwapTreeSerializer.serializeSwapTree`, `deserializeSwapTree`, `compareTrees`
- **Taproot helpers:** `TaprootUtils.tweakMusig`, `createControlBlock`, `toXOnly`
- **Tx construction:** `constructClaimTransaction`, `constructRefundTransaction`,
  `targetFee`
- **Detection:** `detectSwap`, `detectPreimage`
- **Liquid:** mirrors under `boltz-core/liquid`; initialize `secp256k1-zkp`
  WASM before Liquid tx building (`await initZkp()` / `await secp.get()`)

## 8. Stop conditions

If section 3 (rescue derivation compatibility) or section 4
(cooperative + script-path fallback) cannot be satisfied, stop and ask the
user. Do not ship a partial integration. Re-check against
[Common Mistakes](https://api.docs.boltz.exchange/common-mistakes.html).